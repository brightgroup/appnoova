/**
 * Backup de la base de datos Supabase (schema public).
 * Guarda en backups/ — NO se sube a git (contiene datos sensibles).
 *
 * Uso: npm run backup:db
 */
import { execFileSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { loadEnv, getPostgresUrls, getProjectRef, root } from "./lib/load-env.mjs";

const PG_DUMP = process.env.PG_DUMP || "/opt/homebrew/opt/libpq/bin/pg_dump";

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function runBackup(dbUrl, outFile) {
  execFileSync(PG_DUMP, [
    dbUrl,
    "--schema=public",
    "--no-owner",
    "--no-acl",
    "--format=plain",
    "--file", outFile
  ], {
    stdio: "inherit",
    env: { ...process.env, PGSSLMODE: "require" }
  });
}

async function main() {
  const env = loadEnv();
  const projectRef = getProjectRef(env);
  const urls = getPostgresUrls(env);

  if (!urls.length) {
    console.error("Falta SUPABASE_DB_PASSWORD en .env.local");
    process.exit(1);
  }

  const backupsDir = resolve(root, "backups");
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });

  const outFile = resolve(backupsDir, `supabase-${projectRef}-${timestamp()}.sql`);
  console.log("Proyecto:", projectRef);
  console.log("Destino:", outFile.replace(root + "/", ""));

  let lastErr;
  for (const dbUrl of urls) {
    try {
      runBackup(dbUrl, outFile);
      console.log("\n✓ Backup completado:", outFile);
      console.log("  (Este archivo NO se sube a GitHub — queda solo en tu Mac)");
      return;
    } catch (e) {
      lastErr = e;
      console.log("Intento fallido, probando otra conexión...");
    }
  }

  console.error("No se pudo hacer backup:", lastErr?.message || lastErr);
  process.exit(1);
}

main();
