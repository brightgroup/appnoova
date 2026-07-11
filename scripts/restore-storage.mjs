/**
 * Restaura buckets de Supabase Storage desde el respaldo en Google Drive.
 *
 * ⚠️ Destructivo: hace que el bucket quede idéntico al respaldo (usa
 * `rclone sync`), por lo que archivos subidos después del último backup
 * y que no estén en Drive se perderán. Siempre pide confirmación explícita.
 *
 * Requiere en .env.local (solo para uso local — en GitHub Actions ya están
 * como secrets):
 *   SUPABASE_S3_ACCESS_KEY_ID
 *   SUPABASE_S3_SECRET_ACCESS_KEY
 *
 * Uso:
 *   node scripts/restore-storage.mjs whatsapp-media
 *   node scripts/restore-storage.mjs voice-call-recordings
 *   node scripts/restore-storage.mjs all
 */
import { execFileSync } from "child_process";
import { createInterface } from "readline/promises";
import { loadEnv, getProjectRef } from "./lib/load-env.mjs";

const DRIVE_FOLDER = "gdrive:appnoova-backups/storage";
const BUCKETS = ["whatsapp-media", "voice-call-recordings"];

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function s3Remote(env, bucket) {
  const key = env.SUPABASE_S3_ACCESS_KEY_ID;
  const secret = env.SUPABASE_S3_SECRET_ACCESS_KEY;
  const projectRef = getProjectRef(env);
  if (!key || !secret || !projectRef) {
    throw new Error(
      "Faltan SUPABASE_S3_ACCESS_KEY_ID / SUPABASE_S3_SECRET_ACCESS_KEY en .env.local " +
      "(Supabase → Settings → Storage → S3 Connection)."
    );
  }
  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/s3`;
  return `:s3,provider=Other,access_key_id=${key},secret_access_key=${secret},endpoint=${endpoint},region=us-east-1:${bucket}`;
}

async function confirm(bucket) {
  console.log("\n=== CONFIRMACIÓN DE RESTAURACIÓN DE STORAGE ===");
  console.log("Bucket:", bucket);
  console.log("\nEsto hará que el bucket quede IDÉNTICO al respaldo en Drive.");
  console.log("Archivos subidos después del último backup y que no estén en Drive");
  console.log("se BORRARÁN del bucket.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Escribe RESTAURAR-${bucket.toUpperCase()} para confirmar: `);
  rl.close();
  return answer.trim() === `RESTAURAR-${bucket.toUpperCase()}`;
}

async function restoreBucket(env, bucket) {
  const ok = await confirm(bucket);
  if (!ok) {
    console.log(`Cancelado para ${bucket}. No se hizo ningún cambio.`);
    return;
  }
  const remote = s3Remote(env, bucket);
  console.log(`\nRestaurando ${bucket} desde Drive...`);
  sh("rclone", ["sync", `${DRIVE_FOLDER}/${bucket}`, remote, "--fast-list", "--progress"], {
    stdio: "inherit"
  });
  console.log(`✓ ${bucket} restaurado.`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg || !["whatsapp-media", "voice-call-recordings", "all"].includes(arg)) {
    console.error("Uso: node scripts/restore-storage.mjs <whatsapp-media|voice-call-recordings|all>");
    process.exit(1);
  }

  const env = loadEnv();
  const targets = arg === "all" ? BUCKETS : [arg];

  for (const bucket of targets) {
    await restoreBucket(env, bucket);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
