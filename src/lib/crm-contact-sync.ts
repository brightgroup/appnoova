import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmFieldProvenance, CrmFieldProvenanceEntry } from "@/types/crm";
import { whatsappProvenanceEntry } from "@/lib/crm-contact-provenance";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";

export interface SyncContactFromWhatsAppInput {
  userId: string;
  fromE164: string;
  profileName: string | null;
  conversationId: string;
  lastInboundAt: string;
  optedOut: boolean;
}

function looksLikePhone(value: string, e164: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v === e164) return true;
  const digits = v.replace(/\D/g, "");
  const e164Digits = e164.replace(/\D/g, "");
  return digits.length >= 10 && (digits === e164Digits || e164Digits.endsWith(digits));
}

function resolveNameFromWhatsApp(
  existing: Record<string, unknown> | null,
  profileName: string | null,
  fromE164: string,
  prevProv: CrmFieldProvenance
): { name: string; updateProvenance: boolean } {
  const profile = profileName?.trim();
  const fallback = fromE164;
  const candidate = profile && !looksLikePhone(profile, fromE164) ? profile : fallback;

  if (!existing) {
    return { name: candidate, updateProvenance: Boolean(profile && profile !== fromE164) };
  }

  const current = String(existing.name ?? "").trim();
  const prov = prevProv.name;

  if (prov?.verificado && prov.origen === "manual") {
    return { name: current, updateProvenance: false };
  }

  if (!current || looksLikePhone(current, fromE164)) {
    return { name: candidate, updateProvenance: Boolean(profile && profile !== fromE164) };
  }

  if (prov && !prov.verificado && (prov.origen === "whatsapp" || prov.origen === "ia_conversacion")) {
    if (profile && profile !== fromE164 && profile !== current) {
      return { name: profile, updateProvenance: true };
    }
  }

  return { name: current, updateProvenance: false };
}

function mergeProvenance(
  prev: CrmFieldProvenance,
  field: string,
  entry: CrmFieldProvenanceEntry
): CrmFieldProvenance {
  return { ...prev, [field]: entry };
}

/** Busca contacto por WhatsApp, teléfono o vínculo previo con la conversación. */
async function findContactForWhatsAppInbound(
  db: SupabaseClient,
  userId: string,
  fromE164: string,
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const normalized = normalizeWhatsAppE164(fromE164);

  const { data: byWhatsApp } = await db
    .from("crm_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("whatsapp", normalized)
    .maybeSingle();
  if (byWhatsApp) return byWhatsApp;

  const { data: conv } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const linkedId = (conv?.metadata as Record<string, unknown> | undefined)?.crm_contact_id;
  if (linkedId) {
    const { data: linked } = await db
      .from("crm_contacts")
      .select("*")
      .eq("id", String(linkedId))
      .eq("user_id", userId)
      .maybeSingle();
    if (linked) return linked;
  }

  const { data: inboxLinked } = await db
    .from("crm_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("inbox_conversation_id", conversationId)
    .maybeSingle();
  if (inboxLinked) return inboxLinked;

  for (const field of ["telefono", "phone", "whatsapp"] as const) {
    const { data: byField } = await db
      .from("crm_contacts")
      .select("*")
      .eq("user_id", userId)
      .eq(field, normalized)
      .maybeSingle();
    if (byField) return byField;
  }

  return null;
}

/** Crea o actualiza contacto CRM desde inbound WhatsApp — siempre garantiza ficha vinculada. */
export async function syncCrmContactFromWhatsAppInbound(
  db: SupabaseClient,
  input: SyncContactFromWhatsAppInput
): Promise<{ contactId: string | null; error?: string }> {
  const {
    userId,
    fromE164,
    profileName,
    conversationId,
    lastInboundAt,
    optedOut
  } = input;

  const now = lastInboundAt;
  const normalizedFrom = normalizeWhatsAppE164(fromE164);

  const existing = await findContactForWhatsAppInbound(db, userId, normalizedFrom, conversationId);

  let supresiones: string[] = Array.isArray(existing?.supresiones) ? [...existing.supresiones] : [];
  if (optedOut && !supresiones.includes("no_whatsapp")) {
    supresiones = [...supresiones, "no_whatsapp"];
  } else if (!optedOut) {
    supresiones = supresiones.filter(s => s !== "no_whatsapp");
  }

  const prevProv = (existing?.field_provenance as CrmFieldProvenance) ?? {};
  let fieldProvenance = { ...prevProv };

  const { name, updateProvenance: nameFromProfile } = resolveNameFromWhatsApp(
    existing,
    profileName,
    normalizedFrom,
    prevProv
  );

  // Campos del canal WhatsApp — no pisar procedencia manual verificada
  if (!prevProv.whatsapp?.verificado || prevProv.whatsapp.origen !== "manual") {
    fieldProvenance = mergeProvenance(fieldProvenance, "whatsapp", whatsappProvenanceEntry(now, "alta", true));
  }
  if (!prevProv.telefono?.verificado || prevProv.telefono.origen !== "manual") {
    fieldProvenance = mergeProvenance(fieldProvenance, "telefono", whatsappProvenanceEntry(now, "alta", true));
  }

  if (!existing || nameFromProfile) {
    fieldProvenance = mergeProvenance(
      fieldProvenance,
      "name",
      whatsappProvenanceEntry(now, profileName?.trim() ? "media" : "alta", false)
    );
  }

  const prevMeta = (existing?.metadata as Record<string, unknown>) ?? {};
  const manualTelefono = prevProv.telefono?.verificado && prevProv.telefono.origen === "manual";
  const manualWhatsapp = prevProv.whatsapp?.verificado && prevProv.whatsapp.origen === "manual";

  const payload: Record<string, unknown> = {
    user_id: userId,
    name,
    whatsapp: manualWhatsapp && existing?.whatsapp ? existing.whatsapp : normalizedFrom,
    telefono: manualTelefono && existing?.telefono ? existing.telefono : (existing?.telefono ?? normalizedFrom),
    phone: manualTelefono && existing?.phone ? existing.phone : (existing?.phone ?? normalizedFrom),
    canal_preferido: existing?.canal_preferido ?? "whatsapp",
    ultimo_inbound_wa: lastInboundAt,
    inbox_conversation_id: conversationId,
    estado_whatsapp: "valido",
    fuente_origen: existing?.fuente_origen ?? "recepcion_ia",
    supresiones: supresiones,
    field_provenance: fieldProvenance,
    metadata: {
      ...prevMeta,
      registro_canal: "whatsapp",
      whatsapp_profile_name: profileName?.trim() || null
    },
    updated_at: now
  };

  if (existing) {
    const { data, error } = await db
      .from("crm_contacts")
      .update(payload)
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[crm/sync] update failed:", error.message);
      return { contactId: null, error: error.message };
    }
    const contactId = data?.id ? String(data.id) : String(existing.id);
    await linkConversationToContact(db, userId, conversationId, contactId);
    console.info(`[crm/sync] updated contact ${contactId} from WhatsApp ${normalizedFrom}`);
    return { contactId };
  }

  const { data: created, error } = await db
    .from("crm_contacts")
    .insert({
      ...payload,
      tipo_contacto: "persona",
      tipo_relacion: "prospecto",
      tags: [],
      categorias_interes: []
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const retry = await findContactForWhatsAppInbound(db, userId, normalizedFrom, conversationId);
      if (retry) {
        const { data: updated, error: updErr } = await db
          .from("crm_contacts")
          .update(payload)
          .eq("id", retry.id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();

        if (updErr) {
          console.error("[crm/sync] update after conflict failed:", updErr.message);
          return { contactId: null, error: updErr.message };
        }
        const contactId = updated?.id ? String(updated.id) : String(retry.id);
        await linkConversationToContact(db, userId, conversationId, contactId);
        console.info(`[crm/sync] updated contact ${contactId} after insert conflict`);
        return { contactId };
      }
    }
    console.error("[crm/sync] insert failed:", error.message);
    return { contactId: null, error: error.message };
  }

  const contactId = String(created.id);
  await linkConversationToContact(db, userId, conversationId, contactId);
  console.info(`[crm/sync] created contact ${contactId} from WhatsApp ${normalizedFrom}`);
  return { contactId };
}

async function linkConversationToContact(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  contactId: string
) {
  const { data: conv } = await db
    .from("text_agent_conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const meta = (conv?.metadata as Record<string, unknown>) ?? {};
  await db
    .from("text_agent_conversations")
    .update({
      metadata: { ...meta, crm_contact_id: contactId },
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId)
    .eq("user_id", userId);
}
