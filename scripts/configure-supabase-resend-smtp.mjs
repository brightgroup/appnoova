/**
 * Configura Supabase Auth para enviar emails (login, reset, confirmación)
 * con el mismo SMTP de Resend que usa la app.
 *
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local
 * Token: https://supabase.com/dashboard/account/tokens
 *
 * Uso: node scripts/configure-supabase-resend-smtp.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

function parseFrom(from) {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "Noova 360", email: from.trim() };
}

async function main() {
  const env = loadEnv();
  const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
  const token = env.SUPABASE_ACCESS_TOKEN?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();
  const fromRaw = env.RESEND_FROM_EMAIL?.trim() || "Noova 360 <onboarding@resend.dev>";
  const { name: senderName, email: adminEmail } = parseFrom(fromRaw);

  if (!projectRef) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
    process.exit(1);
  }
  if (!token) {
    console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local");
    console.error("Créalo en: https://supabase.com/dashboard/account/tokens");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("Falta RESEND_API_KEY en .env.local");
    process.exit(1);
  }

  const payload = {
    external_email_enabled: true,
    mailer_secure_email_change_enabled: true,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: apiKey,
    smtp_admin_email: adminEmail,
    smtp_sender_name: senderName,
    smtp_max_frequency: 30
  };

  console.log("Proyecto:", projectRef);
  console.log("SMTP host: smtp.resend.com");
  console.log("From (auth):", `${senderName} <${adminEmail}>`);

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Error configurando Auth SMTP:", res.status, text);
    process.exit(1);
  }

  console.log("\n✓ Supabase Auth configurado con Resend SMTP");
  console.log("  Emails de login, confirmación y reset usarán el mismo remitente.");
  console.log("\nVerifica en: https://supabase.com/dashboard/project/" + projectRef + "/auth/smtp");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
