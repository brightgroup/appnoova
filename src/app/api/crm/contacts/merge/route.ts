import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { toCrmContact } from "@/lib/crm-record";
import type { CrmFieldProvenance } from "@/types/crm";

export async function POST(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const primaryId = String(body.primary_id ?? "").trim();
  const mergeIds = Array.isArray(body.merge_ids)
    ? body.merge_ids.map((id: unknown) => String(id).trim()).filter((id: string) => id && id !== primaryId)
    : [];

  if (!primaryId || mergeIds.length === 0) {
    return NextResponse.json({ error: "primary_id y merge_ids son requeridos" }, { status: 400 });
  }

  const db = textAgentsAdminClient();

  const { data: primary } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", primaryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!primary) return NextResponse.json({ error: "Contacto principal no encontrado" }, { status: 404 });

  const { data: secondaries } = await db
    .from("crm_contacts")
    .select("*")
    .eq("user_id", userId)
    .in("id", mergeIds);

  if (!secondaries?.length) {
    return NextResponse.json({ error: "No hay contactos para fusionar" }, { status: 400 });
  }

  let mergedTags = new Set<string>(Array.isArray(primary.tags) ? primary.tags : []);
  let mergedCats = new Set<string>(Array.isArray(primary.categorias_interes) ? primary.categorias_interes : []);
  const prov: CrmFieldProvenance = { ...(primary.field_provenance as CrmFieldProvenance) };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const sec of secondaries) {
    for (const t of Array.isArray(sec.tags) ? sec.tags : []) mergedTags.add(String(t));
    for (const c of Array.isArray(sec.categorias_interes) ? sec.categorias_interes : []) mergedCats.add(String(c));

    const secProv = (sec.field_provenance as CrmFieldProvenance) ?? {};
    for (const [k, v] of Object.entries(secProv)) {
      if (!prov[k]) prov[k] = v;
    }

    if (!primary.whatsapp && sec.whatsapp) patch.whatsapp = sec.whatsapp;
    if (!primary.telefono && sec.telefono) patch.telefono = sec.telefono;
    if (!primary.email && sec.email) patch.email = sec.email;
    if (!primary.documento_id && sec.documento_id) patch.documento_id = sec.documento_id;
    if (!primary.organizacion && sec.organizacion) patch.organizacion = sec.organizacion;
    if (!primary.inbox_conversation_id && sec.inbox_conversation_id) {
      patch.inbox_conversation_id = sec.inbox_conversation_id;
    }
    if (!primary.notes && sec.notes) patch.notes = sec.notes;
  }

  patch.tags = [...mergedTags];
  patch.categorias_interes = [...mergedCats];
  patch.field_provenance = prov;

  await db.from("crm_leads").update({ contact_id: primaryId }).eq("user_id", userId).in("contact_id", mergeIds);

  for (const sec of secondaries) {
    if (sec.inbox_conversation_id) {
      const { data: conv } = await db
        .from("text_agent_conversations")
        .select("metadata")
        .eq("id", sec.inbox_conversation_id)
        .maybeSingle();
      if (conv) {
        const meta = (conv.metadata as Record<string, unknown>) ?? {};
        await db
          .from("text_agent_conversations")
          .update({ metadata: { ...meta, crm_contact_id: primaryId } })
          .eq("id", sec.inbox_conversation_id);
      }
    }
  }

  await db.from("crm_contacts").update(patch).eq("id", primaryId).eq("user_id", userId);
  await db.from("crm_contacts").delete().eq("user_id", userId).in("id", mergeIds);

  const { data: updated } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", primaryId)
    .maybeSingle();

  return NextResponse.json({
    contact: updated ? toCrmContact(updated) : null,
    merged: mergeIds.length
  });
}
