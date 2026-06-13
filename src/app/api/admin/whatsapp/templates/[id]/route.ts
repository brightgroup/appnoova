import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  extractNamedVariables,
  isValidTemplateName,
  namedBodyToTwilio,
  normalizeTemplateName,
  toWhatsAppTemplateRecord
} from "@/lib/whatsapp/template-record";
import {
  createTwilioContentTemplate,
  fetchTwilioTemplateApproval,
  mapTwilioApprovalToNoovaStatus,
  submitTwilioTemplateForApproval
} from "@/lib/whatsapp/twilio-content";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import type { WhatsAppTemplateCategory } from "@/types/whatsapp-template";

type RouteCtx = { params: Promise<{ id: string }> };

function parseCategory(raw: string): WhatsAppTemplateCategory {
  if (raw === "marketing" || raw === "authentication") return raw;
  return "utility";
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(_req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const template = toWhatsAppTemplateRecord(data);

  if (template.status === "pending_approval" && template.twilio_content_sid && template.provider === "twilio") {
    try {
      const approval = await fetchTwilioTemplateApproval(template.twilio_content_sid);
      const nextStatus = mapTwilioApprovalToNoovaStatus(approval.status);
      if (nextStatus !== "pending_approval") {
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
          .eq("id", id)
          .select("*")
          .single();
        if (updated) {
          return NextResponse.json({ template: toWhatsAppTemplateRecord(updated) });
        }
      }
    } catch {
      // Devolver plantilla sin sync si falla Twilio
    }
  }

  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json();
  const action = String(body.action ?? "save").trim();

  const db = adminClient();
  const { data: existing, error: findErr } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const current = toWhatsAppTemplateRecord(existing);

  if (action === "submit") {
    if (current.status !== "draft" && current.status !== "rejected") {
      return NextResponse.json(
        { error: "Solo se pueden enviar borradores o plantillas rechazadas" },
        { status: 400 }
      );
    }

    const bodySource = String(body.body_source ?? current.body_source ?? current.body_preview).trim();
    const variableNames = extractNamedVariables(bodySource);
    const variableExamples = variableNames.map((name, i) => {
      const examples = Array.isArray(body.variable_examples)
        ? body.variable_examples.map((v: unknown) => String(v).trim())
        : current.variable_examples;
      return examples[i]?.trim() || `ejemplo_${name}`;
    });
    const bodyPreview = namedBodyToTwilio(bodySource, variableNames);
    const category = parseCategory(String(body.category ?? current.category));
    const language = String(body.language ?? current.language).trim() || "es";
    const templateName = normalizeTemplateName(String(body.template_name ?? current.template_name));

    if (current.provider === "dialog360") {
      return NextResponse.json({ error: "Envío automático a Dialog360 aún no disponible" }, { status: 501 });
    }

    try {
      const created = await createTwilioContentTemplate({
        friendlyName: templateName,
        language,
        body: bodyPreview,
        variableNames,
        variableExamples
      });
      await submitTwilioTemplateForApproval({
        contentSid: created.sid,
        templateName,
        category
      });

      const { data: updated, error } = await db
        .from("whatsapp_templates")
        .update({
          twilio_content_sid: created.sid,
          template_name: templateName,
          category,
          language,
          body_preview: bodyPreview,
          body_source: bodySource,
          variable_labels: variableNames,
          variable_examples: variableExamples,
          status: "pending_approval",
          rejection_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ template: toWhatsAppTemplateRecord(updated) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al enviar a Twilio";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  if (current.status !== "draft" && current.status !== "rejected") {
    return NextResponse.json(
      { error: "Solo se pueden editar borradores o plantillas rechazadas" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.body_source !== undefined) {
    const bodySource = String(body.body_source).trim();
    const variableNames = extractNamedVariables(bodySource);
    const variableExamples = variableNames.map((name, i) => {
      const examples = Array.isArray(body.variable_examples)
        ? body.variable_examples.map((v: unknown) => String(v).trim())
        : current.variable_examples;
      return examples[i]?.trim() || `ejemplo_${name}`;
    });
    updates.body_source = bodySource;
    updates.body_preview = namedBodyToTwilio(bodySource, variableNames);
    updates.variable_labels = variableNames;
    updates.variable_examples = variableExamples;
  } else if (Array.isArray(body.variable_examples)) {
    updates.variable_examples = body.variable_examples.map((v: unknown) => String(v).trim());
  }

  if (body.template_name !== undefined) {
    const name = normalizeTemplateName(String(body.template_name));
    if (!isValidTemplateName(name)) {
      return NextResponse.json({ error: "Nombre de plantilla inválido" }, { status: 400 });
    }
    updates.template_name = name;
  }

  if (body.category !== undefined) updates.category = parseCategory(String(body.category));
  if (body.language !== undefined) updates.language = String(body.language).trim();
  if (body.status === "inactive") updates.status = "inactive";

  const { data: updated, error } = await db
    .from("whatsapp_templates")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: toWhatsAppTemplateRecord(updated) });
}
