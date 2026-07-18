import type { SupabaseClient } from "@supabase/supabase-js";
import {
  exchangeMetaEmbeddedSignupCode,
  fetchMetaPhoneNumberDetails,
  fetchMetaWabaPhoneNumbers
} from "@/lib/meta/oauth";
import { normalizeWhatsAppE164 } from "@/lib/whatsapp-channel";
import type { EmbeddedSignupCompleteInput } from "@/lib/whatsapp/embedded-signup-provision";

function normalizePhoneCandidate(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const normalized = normalizeWhatsAppE164(raw);
  return normalized.length > 4 ? normalized : "";
}

export interface ResolvedEmbeddedSignupPhone {
  e164: string;
  phoneNumberId: string | null;
  /** Token del exchange OAuth (una sola vez). Null si no hizo falta o falló. */
  accessToken: string | null;
}

/**
 * Resuelve E.164 (+ phone_number_id) tras Embedded Signup.
 * Meta a menudo manda solo waba_id o phone_number_id sin display_phone_number;
 * en ese caso se usa el auth_code → Graph API (el código OAuth solo se canjea una vez).
 */
export async function resolveEmbeddedSignupPhone(
  db: SupabaseClient,
  input: EmbeddedSignupCompleteInput & {
    authCode?: string | null;
    displayPhoneNumber?: string | null;
  }
): Promise<ResolvedEmbeddedSignupPhone> {
  const wabaId = input.wabaId.trim();
  let phoneNumberId = input.phoneNumberId?.trim() || "";
  let e164 =
    normalizePhoneCandidate(input.phoneE164)
    || normalizePhoneCandidate(input.displayPhoneNumber);

  let accessToken: string | null = null;
  const needsGraph = !e164 || !phoneNumberId;

  if (needsGraph && input.authCode?.trim()) {
    try {
      const token = await exchangeMetaEmbeddedSignupCode(input.authCode.trim());
      accessToken = token.accessToken;
    } catch (err) {
      console.warn("[whatsapp/resolve-phone] OAuth exchange:", err);
    }
  }

  if (accessToken && !e164 && phoneNumberId) {
    try {
      const details = await fetchMetaPhoneNumberDetails(phoneNumberId, accessToken);
      e164 = details.e164;
    } catch (err) {
      console.warn("[whatsapp/resolve-phone] phone fetch by id:", err);
    }
  }

  if (accessToken && (!e164 || !phoneNumberId)) {
    try {
      const phones = await fetchMetaWabaPhoneNumbers(wabaId, accessToken);
      if (phoneNumberId) {
        const match = phones.find(phone => phone.id === phoneNumberId);
        if (match) e164 = match.e164;
      } else if (phones.length === 1) {
        phoneNumberId = phones[0].id;
        e164 = phones[0].e164;
      } else if (phones.length > 1 && e164) {
        const match = phones.find(phone => phone.e164 === e164);
        if (match) phoneNumberId = match.id;
      } else if (phones.length > 1 && !e164) {
        console.warn(
          `[whatsapp/resolve-phone] WABA ${wabaId} tiene ${phones.length} números; falta phone_number_id/display`
        );
      }
    } catch (err) {
      console.warn("[whatsapp/resolve-phone] WABA phone_numbers:", err);
    }
  }

  if (!e164 && input.channelId?.trim()) {
    const { data: channel } = await db
      .from("whatsapp_channels")
      .select("e164, meta_phone_number_id")
      .eq("id", input.channelId.trim())
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    e164 = normalizePhoneCandidate(channel?.e164 ? String(channel.e164) : null);
    if (!phoneNumberId && channel?.meta_phone_number_id) {
      phoneNumberId = String(channel.meta_phone_number_id).trim();
    }
  }

  if (!e164) {
    throw new Error(
      "No se recibió el número de teléfono. Completa el flujo de Meta o indica el número en formato E.164."
    );
  }

  return { e164, phoneNumberId: phoneNumberId || null, accessToken };
}
