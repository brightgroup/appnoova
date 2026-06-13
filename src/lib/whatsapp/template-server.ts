import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import {
  extractNamedVariables,
  isValidTemplateName,
  namedBodyToTwilio,
  normalizeTemplateName,
  PMV_BROKER_TEMPLATE_PRESETS,
  toWhatsAppTemplateRecord
} from "@/lib/whatsapp/template-record";
import {
  createTwilioContentTemplate,
  fetchTwilioTemplateApproval,
  mapTwilioApprovalToNoovaStatus,
  submitTwilioTemplateForApproval
} from "@/lib/whatsapp/twilio-content";
import type { WhatsAppTemplateCategory, WhatsAppTemplateRecord } from "@/types/whatsapp-template";

type TemplateResult =
  | { ok: true; template: WhatsAppTemplateRecord }
  | { ok: false; status: number; error: string };

export function parseTemplateCategory(raw: string): WhatsAppTemplateCategory {
  if (raw === "marketing" || raw === "authentication") return raw;
  return "utility";
}

export function buildTemplatePayload(body: Record<string, unknown>) {
  const bodySource = String(body.body_source ?? body.body_preview ?? "").trim();
  const variableNames = extractNamedVariables(bodySource);
  const variableExamples = variableNames.map((name, i) => {
    const examples = Array.isArray(body.variable_examples)
      ? body.variable_examples.map((v: unknown) => String(v).trim())
      : [];
    return examples[i]?.trim() || `ejemplo_${name}`;
  });

  return {
    templateName: normalizeTemplateName(String(body.template_name ?? "")),
    category: parseTemplateCategory(String(body.category ?? "utility")),
    language: String(body.language ?? "es").trim() || "es",
    bodySource,
    bodyPreview: namedBodyToTwilio(bodySource, variableNames),
    variableNames,
    variableExamples
  };
}

async function getUserChannel(
  db: SupabaseClient,
  channelId: string,
  userId: string
) {
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toWhatsAppChannelRecord(data);
}

async function submitToProvider(input: {
  provider: string;
  templateName: string;
  language: string;
  bodyPreview: string;
  variableNames: string[];
  variableExamples: string[];
  category: WhatsAppTemplateCategory;
}): Promise<string> {
  if (input.provider === "dialog360") {
    throw new Error("Envío automático a Dialog360 aún no disponible");
  }

  const created = await createTwilioContentTemplate({
    friendlyName: input.templateName,
    language: input.language,
    body: input.bodyPreview,
    variableNames: input.variableNames,
    variableExamples: input.variableExamples
  });
  await submitTwilioTemplateForApproval({
    contentSid: created.sid,
    templateName: input.templateName,
    category: input.category
  });
  return created.sid;
}

export async function syncTemplateApproval(
  db: SupabaseClient,
  template: WhatsAppTemplateRecord
): Promise<WhatsAppTemplateRecord> {
  if (
    template.status !== "pending_approval" ||
    !template.twilio_content_sid ||
    template.provider !== "twilio"
  ) {
    return template;
  }

  try {
    const approval = await fetchTwilioTemplateApproval(template.twilio_content_sid);
    const nextStatus = mapTwilioApprovalToNoovaStatus(approval.status);
    if (nextStatus === "pending_approval") return template;

    const updates: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString()
    };
    if (nextStatus === "rejected" && approval.rejectionReason) {
      updates.rejection_reason = approval.rejectionReason;
    }

    const { data: updated } = await db
      .from("whatsapp_templates")
      .update(updates)
      .eq("id", template.id)
      .select("*")
      .single();

    return updated ? toWhatsAppTemplateRecord(updated) : template;
  } catch {
    return template;
  }
}

export async function createWhatsAppTemplate(input: {
  db: SupabaseClient;
  userId: string;
  body: Record<string, unknown>;
  action: "draft" | "submit";
}): Promise<TemplateResult> {
  const channelId = String(input.body.whatsapp_channel_id ?? "").trim();
  if (!channelId) {
    return { ok: false as const, status: 400, error: "whatsapp_channel_id es requerido" };
  }

  const payload = buildTemplatePayload(input.body);
  if (!payload.templateName || !payload.bodySource) {
    return { ok: false as const, status: 400, error: "template_name y body_source son requeridos" };
  }
  if (!isValidTemplateName(payload.templateName)) {
    return {
      ok: false as const,
      status: 400,
      error: "Nombre inválido. Usa solo minúsculas, números y guiones bajos"
    };
  }
  if (payload.bodyPreview.length > 1024) {
    return { ok: false as const, status: 400, error: "El cuerpo no puede superar 1024 caracteres" };
  }

  const channel = await getUserChannel(input.db, channelId, input.userId);
  if (!channel) {
    return { ok: false as const, status: 404, error: "Canal WhatsApp no encontrado" };
  }

  const provider = channel.provider === "dialog360" ? "dialog360" : "twilio";
  let contentSid: string | null = null;
  let status: "draft" | "pending_approval" = "draft";

  if (input.action === "submit") {
    try {
      contentSid = await submitToProvider({
        provider,
        templateName: payload.templateName,
        language: payload.language,
        bodyPreview: payload.bodyPreview,
        variableNames: payload.variableNames,
        variableExamples: payload.variableExamples,
        category: payload.category
      });
      status = "pending_approval";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar al proveedor";
      return { ok: false as const, status: 502, error: msg };
    }
  }

  const { data, error } = await input.db
    .from("whatsapp_templates")
    .insert({
      whatsapp_channel_id: channelId,
      user_id: input.userId,
      provider,
      twilio_content_sid: contentSid,
      template_name: payload.templateName,
      category: payload.category,
      language: payload.language,
      body_preview: payload.bodyPreview,
      body_source: payload.bodySource,
      variable_labels: payload.variableNames,
      variable_examples: payload.variableExamples,
      status
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false as const, status: 409, error: "Ya existe una plantilla con ese nombre en el canal" };
    }
    return { ok: false as const, status: 500, error: error.message };
  }

  return { ok: true as const, template: toWhatsAppTemplateRecord(data) };
}

export async function updateWhatsAppTemplate(input: {
  db: SupabaseClient;
  userId: string;
  templateId: string;
  body: Record<string, unknown>;
}): Promise<TemplateResult> {
  const action = String(input.body.action ?? "save").trim();

  const { data: existing, error: findErr } = await input.db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", input.templateId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (findErr) return { ok: false as const, status: 500, error: findErr.message };
  if (!existing) return { ok: false as const, status: 404, error: "Plantilla no encontrada" };

  const current = toWhatsAppTemplateRecord(existing);

  if (action === "submit") {
    if (current.status !== "draft" && current.status !== "rejected") {
      return { ok: false as const, status: 400, error: "Solo se pueden enviar borradores o plantillas rechazadas" };
    }

    const payload = buildTemplatePayload({
      template_name: input.body.template_name ?? current.template_name,
      category: input.body.category ?? current.category,
      language: input.body.language ?? current.language,
      body_source: input.body.body_source ?? current.body_source ?? current.body_preview,
      variable_examples: input.body.variable_examples ?? current.variable_examples
    });

    try {
      const contentSid = await submitToProvider({
        provider: current.provider,
        templateName: payload.templateName,
        language: payload.language,
        bodyPreview: payload.bodyPreview,
        variableNames: payload.variableNames,
        variableExamples: payload.variableExamples,
        category: payload.category
      });

      const { data: updated, error } = await input.db
        .from("whatsapp_templates")
        .update({
          twilio_content_sid: contentSid,
          template_name: payload.templateName,
          category: payload.category,
          language: payload.language,
          body_preview: payload.bodyPreview,
          body_source: payload.bodySource,
          variable_labels: payload.variableNames,
          variable_examples: payload.variableExamples,
          status: "pending_approval",
          rejection_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", input.templateId)
        .eq("user_id", input.userId)
        .select("*")
        .single();

      if (error) return { ok: false as const, status: 500, error: error.message };
      return { ok: true as const, template: toWhatsAppTemplateRecord(updated) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar al proveedor";
      return { ok: false as const, status: 502, error: msg };
    }
  }

  if (current.status !== "draft" && current.status !== "rejected") {
    return { ok: false as const, status: 400, error: "Solo se pueden editar borradores o plantillas rechazadas" };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.body.body_source !== undefined) {
    const payload = buildTemplatePayload({
      ...input.body,
      template_name: input.body.template_name ?? current.template_name,
      category: input.body.category ?? current.category,
      language: input.body.language ?? current.language
    });
    updates.body_source = payload.bodySource;
    updates.body_preview = payload.bodyPreview;
    updates.variable_labels = payload.variableNames;
    updates.variable_examples = payload.variableExamples;
  } else if (Array.isArray(input.body.variable_examples)) {
    updates.variable_examples = input.body.variable_examples.map((v: unknown) => String(v).trim());
  }

  if (input.body.template_name !== undefined) {
    const name = normalizeTemplateName(String(input.body.template_name));
    if (!isValidTemplateName(name)) {
      return { ok: false as const, status: 400, error: "Nombre de plantilla inválido" };
    }
    updates.template_name = name;
  }

  if (input.body.category !== undefined) updates.category = parseTemplateCategory(String(input.body.category));
  if (input.body.language !== undefined) updates.language = String(input.body.language).trim();
  if (input.body.status === "inactive") updates.status = "inactive";

  const { data: updated, error } = await input.db
    .from("whatsapp_templates")
    .update(updates)
    .eq("id", input.templateId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (error) return { ok: false as const, status: 500, error: error.message };
  return { ok: true as const, template: toWhatsAppTemplateRecord(updated) };
}

export async function deleteWhatsAppTemplate(input: {
  db: SupabaseClient;
  userId: string;
  templateId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await input.db
    .from("whatsapp_templates")
    .delete()
    .eq("id", input.templateId)
    .eq("user_id", input.userId);

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export { PMV_BROKER_TEMPLATE_PRESETS };
