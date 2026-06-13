import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import {
  extractNamedVariables,
  isValidTemplateName,
  namedBodyToTwilio,
  normalizeTemplateName,
  PMV_BROKER_TEMPLATE_PRESETS,
  toWhatsAppTemplateRecord
} from "@/lib/whatsapp/template-record";
import { syncPendingWhatsAppTemplates } from "@/lib/whatsapp/template-sync";
import {
  createTwilioContentTemplate,
  submitTwilioTemplateForApproval
} from "@/lib/whatsapp/twilio-content";
import type { WhatsAppTemplateCategory } from "@/types/whatsapp-template";

function parseCategory(raw: string): WhatsAppTemplateCategory {
  if (raw === "marketing" || raw === "authentication") return raw;
  return "utility";
}

function buildTemplatePayload(body: Record<string, unknown>) {
  const bodySource = String(body.body_source ?? body.body_preview ?? "").trim();
  const variableNames = extractNamedVariables(bodySource);
  const variableExamples = variableNames.map((name, i) => {
    const examples = Array.isArray(body.variable_examples)
      ? body.variable_examples.map((v: unknown) => String(v).trim())
      : [];
    return examples[i]?.trim() || `ejemplo_${name}`;
  });

  const templateName = normalizeTemplateName(String(body.template_name ?? ""));
  const category = parseCategory(String(body.category ?? "utility"));
  const language = String(body.language ?? "es").trim() || "es";
  const bodyPreview = namedBodyToTwilio(bodySource, variableNames);

  return {
    templateName,
    category,
    language,
    bodySource,
    bodyPreview,
    variableNames,
    variableExamples
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const channelId = req.nextUrl.searchParams.get("whatsapp_channel_id");
  const db = adminClient();

  await syncPendingWhatsAppTemplates(db);

  let query = db.from("whatsapp_templates").select("*").order("created_at", { ascending: false });
  if (channelId) query = query.eq("whatsapp_channel_id", channelId);

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ templates: [], presets: PMV_BROKER_TEMPLATE_PRESETS, dbReady: false }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    templates: (data ?? []).map(row => toWhatsAppTemplateRecord(row)),
    presets: PMV_BROKER_TEMPLATE_PRESETS,
    dbReady: true
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const channelId = String(body.whatsapp_channel_id ?? "").trim();
  const action = String(body.action ?? "draft").trim();

  if (!channelId) {
    return NextResponse.json({ error: "whatsapp_channel_id es requerido" }, { status: 400 });
  }

  const payload = buildTemplatePayload(body);
  if (!payload.templateName || !payload.bodySource) {
    return NextResponse.json(
      { error: "template_name y body_source son requeridos" },
      { status: 400 }
    );
  }

  if (!isValidTemplateName(payload.templateName)) {
    return NextResponse.json(
      { error: "Nombre inválido. Usa solo minúsculas, números y guiones bajos (ej. confirmacion_pedido)" },
      { status: 400 }
    );
  }

  if (payload.bodyPreview.length > 1024) {
    return NextResponse.json({ error: "El cuerpo no puede superar 1024 caracteres" }, { status: 400 });
  }

  const db = adminClient();
  const { data: channelRow, error: chErr } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("id", channelId)
    .maybeSingle();

  if (chErr || !channelRow) {
    return NextResponse.json({ error: "Canal WhatsApp no encontrado" }, { status: 404 });
  }

  const channel = toWhatsAppChannelRecord(channelRow);
  const provider = channel.provider === "dialog360" ? "dialog360" : "twilio";

  if (action === "submit" && provider === "dialog360") {
    return NextResponse.json(
      { error: "Envío automático a Dialog360 aún no disponible" },
      { status: 501 }
    );
  }

  let contentSid: string | null = null;
  let status: "draft" | "pending_approval" = "draft";

  if (action === "submit" && provider === "twilio") {
    try {
      const created = await createTwilioContentTemplate({
        friendlyName: payload.templateName,
        language: payload.language,
        body: payload.bodyPreview,
        variableNames: payload.variableNames,
        variableExamples: payload.variableExamples
      });
      contentSid = created.sid;
      await submitTwilioTemplateForApproval({
        contentSid,
        templateName: payload.templateName,
        category: payload.category
      });
      status = "pending_approval";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar a Twilio";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const { data, error } = await db
    .from("whatsapp_templates")
    .insert({
      whatsapp_channel_id: channelId,
      user_id: String(channel.user_id),
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
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Ejecuta 023 y 024_whatsapp_templates" }, { status: 503 });
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya existe una plantilla con ese nombre en el canal" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: toWhatsAppTemplateRecord(data) });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const db = adminClient();
  const { error } = await db.from("whatsapp_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
