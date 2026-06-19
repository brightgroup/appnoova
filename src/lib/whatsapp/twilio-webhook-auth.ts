import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTwilioWebhookSignature } from "@/lib/whatsapp/twilio-whatsapp";

/** Token de auth para validar webhooks según AccountSid (master o subcuenta). */
export async function resolveTwilioAuthTokenForAccount(
  db: SupabaseClient,
  accountSid: string
): Promise<string | null> {
  const masterSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const masterToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (masterSid && accountSid === masterSid && masterToken) {
    return masterToken;
  }

  if (accountSid) {
    const { data: channel } = await db
      .from("whatsapp_channels")
      .select("twilio_subaccount_auth_token")
      .eq("twilio_subaccount_sid", accountSid)
      .not("twilio_subaccount_auth_token", "is", null)
      .limit(1)
      .maybeSingle();

    if (channel?.twilio_subaccount_auth_token) {
      return String(channel.twilio_subaccount_auth_token);
    }

    const { data: org } = await db
      .from("organizations")
      .select("twilio_subaccount_auth_token")
      .eq("twilio_subaccount_sid", accountSid)
      .maybeSingle();

    if (org?.twilio_subaccount_auth_token) {
      return String(org.twilio_subaccount_auth_token);
    }
  }

  return masterToken ?? null;
}

function webhookUrlVariants(url: string): string[] {
  const variants = new Set<string>([url]);
  if (url.endsWith("/")) variants.add(url.slice(0, -1));
  else variants.add(`${url}/`);
  return [...variants];
}

/** Valida firma Twilio probando master + subcuenta del AccountSid del payload. */
export async function validateTwilioWebhookRequest(
  db: SupabaseClient,
  signature: string | null,
  webhookUrl: string,
  params: Record<string, string>
): Promise<boolean> {
  if (process.env.TWILIO_WHATSAPP_SKIP_SIGNATURE === "1") return true;
  if (!signature) return false;

  const accountSid = String(params.AccountSid ?? "");
  const tokens = new Set<string>();

  const resolved = await resolveTwilioAuthTokenForAccount(db, accountSid);
  if (resolved) tokens.add(resolved);

  const masterToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (masterToken) tokens.add(masterToken);

  for (const url of webhookUrlVariants(webhookUrl)) {
    for (const token of tokens) {
      if (validateTwilioWebhookSignature(signature, url, params, token)) {
        return true;
      }
    }
  }

  return false;
}
