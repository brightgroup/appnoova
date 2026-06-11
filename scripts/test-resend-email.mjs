/**
 * Prueba envío de email vía Resend (misma config que la app).
 * Uso: node scripts/test-resend-email.mjs
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

async function main() {
  const env = loadEnv();
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim() || "Noova 360 <onboarding@resend.dev>";
  const to =
    env.LANDING_LEAD_NOTIFY_EMAIL?.split(",")[0]?.trim() ||
    env.NOOVA_ADMIN_EMAIL?.split(",")[0]?.trim() ||
    "info@bgsoluciones.com.co";

  if (!apiKey) {
    console.error("Falta RESEND_API_KEY");
    process.exit(1);
  }

  console.log("From:", from);
  console.log("To:", to);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Prueba Noova 360 — Resend configurado",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;color:#111">
          <h2 style="color:#5b5bf6">Email de prueba — Noova 360</h2>
          <p>Si recibe este correo, Resend está configurado correctamente para leads y notificaciones de la app.</p>
          <p style="color:#666;font-size:13px">${new Date().toLocaleString("es-CO")}</p>
        </div>
      `.trim()
    })
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("✗ Error:", res.status, text);
    process.exit(1);
  }

  console.log("✓ Email enviado:", text);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
