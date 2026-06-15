import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichCrmContactFromWhatsAppConversation } from "@/lib/crm-contact-enrich";
import { syncCrmContactFromWhatsAppInbound } from "@/lib/crm-contact-sync";
import { WHATSAPP_CONVERSATION_CHANNEL, normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";

function parseProfileFromLabel(contactLabel: string | null | undefined): string | null {
  const label = String(contactLabel ?? "").trim();
  if (!label) return null;
  const name = label.includes(" · ") ? label.split(" · ")[0]?.trim() : label;
  if (!name) return null;
  if (/^\+?\d[\d\s()-]{8,}$/.test(name.replace(/\s/g, ""))) return null;
  return name;
}

/** Resuelve E.164 del contacto desde metadata o contact_label de la conversación. */
export function resolveWhatsAppE164FromConversation(conv: {
  metadata?: unknown;
  contact_label?: string | null;
}): string | null {
  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  if (meta.whatsapp_contact_e164) {
    return normalizeWhatsAppE164(String(meta.whatsapp_contact_e164));
  }

  const label = String(conv.contact_label ?? "").trim();
  if (!label) return null;

  const candidates = label.includes(" · ")
    ? [label.split(" · ").pop()?.trim(), label.split(" · ")[0]?.trim()]
    : [label];

  for (const part of candidates) {
    if (!part) continue;
    const compact = part.replace(/[\s().-]/g, "");
    if (/^\+?\d{10,15}$/.test(compact)) {
      return normalizeWhatsAppE164(part);
    }
  }

  return null;
}

export async function syncCrmFromConversationRow(
  db: SupabaseClient,
  userId: string,
  conv: Record<string, unknown>,
  options?: { enrich?: boolean }
): Promise<{ contactId: string | null; error?: string; skipped?: boolean }> {
  if (String(conv.channel) !== WHATSAPP_CONVERSATION_CHANNEL) {
    return { contactId: null, skipped: true };
  }

  const conversationId = String(conv.id ?? "");
  if (!conversationId) return { contactId: null, error: "conversación sin id" };

  const fromE164 = resolveWhatsAppE164FromConversation(conv);
  if (!fromE164) {
    return { contactId: null, skipped: true, error: "sin número WhatsApp en la conversación" };
  }

  const meta = (conv.metadata ?? {}) as Record<string, unknown>;
  const lastInboundAt =
    (meta.whatsapp_last_inbound_at ? String(meta.whatsapp_last_inbound_at) : null) ??
    String(conv.updated_at ?? new Date().toISOString());

  const profileName =
    parseProfileFromLabel(conv.contact_label as string | null) ??
    (meta.whatsapp_profile_name ? String(meta.whatsapp_profile_name) : null);

  const { contactId, error } = await syncCrmContactFromWhatsAppInbound(db, {
    userId,
    fromE164,
    profileName,
    conversationId,
    lastInboundAt,
    optedOut: Boolean(meta.whatsapp_opted_out)
  });

  if (error || !contactId) return { contactId: null, error: error ?? "sync falló" };

  if (options?.enrich === true) {
    void enrichCrmContactFromWhatsAppConversation(db, userId, contactId, conversationId).catch(err =>
      console.error("[crm/backfill] enrich:", err)
    );
  }

  return { contactId };
}

export async function backfillCrmContactsFromWhatsAppInbox(
  db: SupabaseClient,
  userId: string,
  options?: { limit?: number; enrichRecent?: number }
): Promise<{
  scanned: number;
  synced: number;
  skipped: number;
  errors: string[];
  contact_ids: string[];
}> {
  const limit = options?.limit ?? 200;
  const enrichRecent = options?.enrichRecent ?? 0;

  const { data: convs, error } = await db
    .from("text_agent_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", WHATSAPP_CONVERSATION_CHANNEL)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { scanned: 0, synced: 0, skipped: 0, errors: [error.message], contact_ids: [] };
  }

  const rows = convs ?? [];
  const contact_ids: string[] = [];
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    const shouldEnrich = enrichRecent > 0 && i < enrichRecent;
    const result = await syncCrmFromConversationRow(db, userId, row, { enrich: shouldEnrich });

    if (result.skipped) {
      skipped++;
      continue;
    }
    if (result.contactId) {
      synced++;
      contact_ids.push(result.contactId);
    } else if (result.error) {
      errors.push(`${row.id}: ${result.error}`);
    }
  }

  console.info(
    `[crm/backfill] user ${userId}: scanned=${rows.length} synced=${synced} skipped=${skipped}`
  );

  return { scanned: rows.length, synced, skipped, errors, contact_ids };
}
