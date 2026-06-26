/**
 * Configura el webhook de Twilio WhatsApp Senders para una línea registrada en Noova.
 *
 * Uso:
 *   NOOVA_WEBHOOK_BASE_URL=https://app.noova360.com node scripts/configure-whatsapp-webhook.mjs --e164 +573137348564
 *   node scripts/configure-whatsapp-webhook.mjs --channel-id 7f81df2b-f072-468e-a07f-2aa3d650a204
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const env = {};
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function parseArgs(argv) {
  const out = { e164: null, channelId: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--e164") out.e164 = argv[++i];
    if (argv[i] === "--channel-id") out.channelId = argv[++i];
  }
  return out;
}

function webhookBaseUrl(env) {
  return (
    process.env.NOOVA_WEBHOOK_BASE_URL?.trim()
    || env.NOOVA_WEBHOOK_BASE_URL?.trim()
    || env.NOOVA_APP_URL?.trim()
    || env.NEXT_PUBLIC_APP_URL?.trim()
    || "https://app.noova360.com"
  ).replace(/\/$/, "");
}

function normalizeE164(value) {
  const trimmed = String(value ?? "").trim();
  const withoutPrefix = trimmed.toLowerCase().startsWith("whatsapp:")
    ? trimmed.slice("whatsapp:".length).trim()
    : trimmed;
  const compact = withoutPrefix.replace(/[\s().-]/g, "");
  if (!compact) return "";
  return compact.startsWith("+") ? compact : `+${compact}`;
}

function authHeader(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function configureSenderWebhook({ e164, accountSid, authToken, webhookBase }) {
  const senderId = `whatsapp:${e164.startsWith("+") ? e164 : `+${e164}`}`;
  const auth = authHeader(accountSid, authToken);
  const webhookUrl = `${webhookBase}/api/telephony/webhooks/twilio/whatsapp`;
  const statusUrl = `${webhookBase}/api/telephony/webhooks/twilio/whatsapp/status`;

  const listRes = await fetch(
    "https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp&PageSize=50",
    { headers: { Authorization: auth } }
  );
  const listJson = await listRes.json().catch(() => ({}));
  if (!listRes.ok) {
    throw new Error(listJson.message || `Twilio list error ${listRes.status}`);
  }

  const sender = listJson.senders?.find(row => row.sender_id === senderId);
  if (!sender?.sid) {
    throw new Error(`No se encontró sender ${senderId} en la subcuenta ${accountSid}`);
  }

  const updateRes = await fetch(
    `https://messaging.twilio.com/v2/Channels/Senders/${sender.sid}`,
    {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        webhook: {
          callback_method: "POST",
          callback_url: webhookUrl,
          status_callback_method: "POST",
          status_callback_url: statusUrl
        }
      })
    }
  );
  const updateJson = await updateRes.json().catch(() => ({}));
  if (!updateRes.ok && updateRes.status !== 202) {
    throw new Error(updateJson.message || `Twilio update error ${updateRes.status}`);
  }

  return { senderSid: sender.sid, webhookUrl, statusUrl, senderStatus: sender.status ?? "unknown" };
}

const env = loadEnv();
const args = parseArgs(process.argv.slice(2));
const base = webhookBaseUrl(env);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let query = db.from("whatsapp_channels").select("*");
if (args.channelId) query = query.eq("id", args.channelId);
else if (args.e164) query = query.eq("e164", normalizeE164(args.e164));
else {
  console.error("Indica --e164 o --channel-id");
  process.exit(1);
}

const { data: channel, error } = await query.maybeSingle();
if (error || !channel) {
  console.error("Canal no encontrado:", error?.message || "sin datos");
  process.exit(1);
}

let subSid = String(channel.twilio_subaccount_sid ?? "").trim();
let subToken = String(channel.twilio_subaccount_auth_token ?? "").trim();
if ((!subSid || !subToken) && channel.organization_id) {
  const { data: org } = await db
    .from("organizations")
    .select("twilio_subaccount_sid, twilio_subaccount_auth_token")
    .eq("id", channel.organization_id)
    .maybeSingle();
  subSid = subSid || String(org?.twilio_subaccount_sid ?? "").trim();
  subToken = subToken || String(org?.twilio_subaccount_auth_token ?? "").trim();
}

if (!subSid || !subToken) {
  console.error("Sin credenciales de subcuenta Twilio para esta línea");
  process.exit(1);
}

console.log(`Configurando webhook para ${channel.e164} (${channel.friendly_name || channel.id})`);
console.log(`Webhook base: ${base}`);

const result = await configureSenderWebhook({
  e164: channel.e164,
  accountSid: subSid,
  authToken: subToken,
  webhookBase: base
});

const { error: updateErr } = await db
  .from("whatsapp_channels")
  .update({
    twilio_subaccount_sid: subSid,
    twilio_subaccount_auth_token: subToken,
    twilio_sender_sid: result.senderSid,
    status: "active",
    updated_at: new Date().toISOString()
  })
  .eq("id", channel.id);

if (updateErr) {
  console.error("Webhook configurado en Twilio pero falló actualizar Supabase:", updateErr.message);
  process.exit(1);
}

console.log("OK", {
  channelId: channel.id,
  senderSid: result.senderSid,
  senderStatus: result.senderStatus,
  webhookUrl: result.webhookUrl
});
