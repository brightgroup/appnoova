import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { hasValidContactChannel } from "@/lib/crm-contactability";
import { mergeManualProvenance } from "@/lib/crm-contact-provenance";
import { getTenantLabels } from "@/lib/crm-labels";
import { enrichCrmContact, toCrmContact, toCrmLead } from "@/lib/crm-record";
import type { CrmFieldProvenance, CrmSuppression } from "@/types/crm";

type Ctx = { params: Promise<{ id: string }> };

const SUPPRESSIONS: CrmSuppression[] = ["no_whatsapp", "no_llamadas", "no_email"];

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const [contactRes, leadsRes, labels] = await Promise.all([
    db.from("crm_contacts").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
    db
      .from("crm_leads")
      .select("*, stage:crm_pipeline_stages(*)")
      .eq("user_id", userId)
      .eq("contact_id", id)
      .order("updated_at", { ascending: false })
      .limit(10),
    getTenantLabels(db, userId)
  ]);

  if (contactRes.error) return NextResponse.json({ error: contactRes.error.message }, { status: 500 });
  if (!contactRes.data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  return NextResponse.json({
    contact: toCrmContact(contactRes.data),
    leads: (leadsRes.data ?? []).map(r => toCrmLead(r as Record<string, unknown>)),
    labels
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const body = await req.json();
  const db = textAgentsAdminClient();

  const { data: existing } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changedFields: string[] = [];

  const stringFields = [
    "name", "documento_id", "organizacion", "whatsapp", "telefono", "email",
    "canal_preferido", "estado_whatsapp", "estado_email", "fuente_origen",
    "ciudad", "tipo_relacion", "tipo_contacto", "notes", "job_title",
    "autorizacion_datos_fuente"
  ] as const;

  for (const key of stringFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key] ? String(body[key]).trim() : null;
      changedFields.push(key);
    }
  }

  if (body.autorizacion_datos !== undefined) {
    updates.autorizacion_datos = Boolean(body.autorizacion_datos);
    if (body.autorizacion_datos && !existing.autorizacion_datos_fecha) {
      updates.autorizacion_datos_fecha = new Date().toISOString();
      updates.autorizacion_datos_fuente = body.autorizacion_datos_fuente ?? "manual";
    }
    changedFields.push("autorizacion_datos");
  }

  if (Array.isArray(body.supresiones)) {
    updates.supresiones = body.supresiones.filter((s: unknown) =>
      SUPPRESSIONS.includes(s as CrmSuppression)
    );
    changedFields.push("supresiones");
  }

  if (Array.isArray(body.categorias_interes)) {
    updates.categorias_interes = body.categorias_interes.map((t: unknown) => String(t).trim()).filter(Boolean);
    changedFields.push("categorias_interes");
  }

  if (Array.isArray(body.tags)) {
    updates.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
    changedFields.push("tags");
  }

  if (body.asesor_asignado !== undefined) {
    updates.asesor_asignado = body.asesor_asignado ? String(body.asesor_asignado) : null;
    changedFields.push("asesor_asignado");
  }

  // Legacy sync
  if (updates.telefono !== undefined) updates.phone = updates.telefono;
  if (updates.organizacion !== undefined) updates.company = updates.organizacion;
  if (updates.fuente_origen !== undefined) updates.source = updates.fuente_origen;

  const prevProv = (existing.field_provenance as CrmFieldProvenance) ?? {};
  if (body.metadata !== undefined && typeof body.metadata === "object" && body.metadata !== null) {
    const prevMeta = (existing.metadata as Record<string, unknown>) ?? {};
    updates.metadata = { ...prevMeta, ...(body.metadata as Record<string, unknown>) };
  }

  if (changedFields.length > 0) {
    updates.field_provenance = mergeManualProvenance(prevProv, changedFields, userId);
  }

  const merged = { ...existing, ...updates };
  const draft = enrichCrmContact(toCrmContact(merged as Record<string, unknown>));
  if (!draft.name?.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  if (!hasValidContactChannel(draft)) {
    return NextResponse.json(
      { error: "Debe existir al menos un canal de contacto válido (WhatsApp, teléfono o email)" },
      { status: 400 }
    );
  }

  const { data, error } = await db
    .from("crm_contacts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  // "No contactar" recién marcado → cancela sus llamadas pendientes en todas las campañas.
  const prevSup = Array.isArray(existing.supresiones) ? (existing.supresiones as string[]) : [];
  const nextSup = Array.isArray(updates.supresiones) ? (updates.supresiones as string[]) : prevSup;
  if (nextSup.includes("no_llamadas") && !prevSup.includes("no_llamadas")) {
    try {
      const { applyDoNotCallEverywhere } = await import("@/lib/campaigns/capture-results");
      const contact = toCrmContact(data);
      await applyDoNotCallEverywhere({
        userId,
        contactId: id,
        phoneE164: contact.telefono ?? contact.whatsapp ?? null,
      });
    } catch (err) {
      console.error("[crm-contact] cancelar llamadas pendientes:", err);
    }
  }

  return NextResponse.json({ contact: toCrmContact(data) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { error } = await db.from("crm_contacts").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
