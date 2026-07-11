/**
 * Restaura la base de datos Supabase (schema public) desde un backup .sql.
 *
 * ⚠️ Destructivo: borra todas las tablas actuales del schema public antes de
 * restaurar. Siempre pide confirmación explícita y hace un backup de último
 * momento del estado actual antes de tocar nada.
 *
 * Uso:
 *   node scripts/restore-supabase.mjs --from-drive          (trae el más reciente de Drive)
 *   node scripts/restore-supabase.mjs --date 2026-07-08     (trae el de esa fecha desde Drive)
 *   node scripts/restore-supabase.mjs backups/supabase-xxx.sql  (usa un archivo local)
 */
import { execFileSync } from "child_process";
import { existsSync, statSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline/promises";
import { loadEnv, getPostgresUrls, getProjectRef, root } from "./lib/load-env.mjs";

const PSQL = process.env.PSQL || "/opt/homebrew/opt/libpq/bin/psql";
const DRIVE_FOLDER = "gdrive:appnoova-backups";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function findLatestOnDrive() {
  const out = sh("rclone", ["lsf", DRIVE_FOLDER, "--files-only"]);
  const files = out.split("\n").map(l => l.trim()).filter(l => l.endsWith(".sql"));
  if (!files.length) throw new Error("No hay backups .sql en " + DRIVE_FOLDER);
  files.sort();
  return files[files.length - 1];
}

function findByDateOnDrive(date) {
  const out = sh("rclone", ["lsf", DRIVE_FOLDER, "--files-only"]);
  const files = out.split("\n").map(l => l.trim()).filter(l => l.includes(date) && l.endsWith(".sql"));
  if (!files.length) throw new Error(`No hay backups del ${date} en ${DRIVE_FOLDER}`);
  files.sort();
  return files[files.length - 1];
}

async function resolveTargetFile(arg) {
  if (arg === "--from-drive") {
    const name = findLatestOnDrive();
    return downloadFromDrive(name);
  }
  if (arg === "--date") {
    const date = process.argv[4];
    if (!date) throw new Error("Uso: --date YYYY-MM-DD");
    const name = findByDateOnDrive(date);
    return downloadFromDrive(name);
  }
  const localPath = resolve(root, arg);
  if (!existsSync(localPath)) throw new Error("Archivo no encontrado: " + localPath);
  return localPath;
}

function downloadFromDrive(name) {
  const dir = resolve(root, "backups/restore-tmp");
  mkdirSync(dir, { recursive: true });
  const dest = resolve(dir, name);
  console.log(`Descargando ${name} desde Drive...`);
  sh("rclone", ["copyto", `${DRIVE_FOLDER}/${name}`, dest], { stdio: "inherit" });
  return dest;
}

async function confirm(filePath) {
  const { size, mtime } = statSync(filePath);
  console.log("\n=== CONFIRMACIÓN DE RESTAURACIÓN ===");
  console.log("Archivo:", filePath.replace(root + "/", ""));
  console.log("Tamaño:", (size / 1024 / 1024).toFixed(2), "MB");
  console.log("Modificado:", mtime.toISOString());
  console.log("\nEsto BORRARÁ todas las tablas actuales del schema public y las");
  console.log("reemplazará con el contenido de este backup. Se toma un backup de");
  console.log("último momento del estado actual antes de continuar.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Escribe RESTAURAR (en mayúsculas) para confirmar: ');
  rl.close();
  if (answer.trim() !== "RESTAURAR") {
    console.log("Cancelado. No se hizo ningún cambio.");
    process.exit(0);
  }
}

function preRestoreBackup() {
  console.log("\nHaciendo backup de último momento del estado actual...");
  sh("node", [resolve(root, "scripts/backup-supabase.mjs")], { stdio: "inherit" });
}

function restore(filePath, dbUrl) {
  // Solo DROP: el dump ya incluye su propio "CREATE SCHEMA public;" (pg_dump
  // lo genera por defecto). Recrearlo aquí antes causa "schema already
  // exists" y corta la restauración a medias.
  console.log("\nBorrando schema public...");
  sh(PSQL, [dbUrl, "-v", "ON_ERROR_STOP=1", "-c",
    "DROP SCHEMA public CASCADE;"
  ], { stdio: "inherit", env: { ...process.env, PGSSLMODE: "require" } });

  console.log("Aplicando dump...");
  sh(PSQL, [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", filePath], {
    stdio: "inherit",
    env: { ...process.env, PGSSLMODE: "require" }
  });

  console.log("Reaplicando grants estándar de Supabase (el dump se hizo con --no-acl)...");
  const grants = `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `;
  sh(PSQL, [dbUrl, "-v", "ON_ERROR_STOP=1", "-c", grants], {
    stdio: "inherit",
    env: { ...process.env, PGSSLMODE: "require" }
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Uso: node scripts/restore-supabase.mjs --from-drive | --date YYYY-MM-DD | <archivo.sql>");
    process.exit(1);
  }

  const env = loadEnv();
  const projectRef = getProjectRef(env);
  const urls = getPostgresUrls(env);
  if (!urls.length) {
    console.error("Falta SUPABASE_DB_PASSWORD en .env.local");
    process.exit(1);
  }

  const filePath = await resolveTargetFile(arg);
  await confirm(filePath);
  preRestoreBackup();

  let lastErr;
  for (const dbUrl of urls) {
    try {
      restore(filePath, dbUrl);
      console.log("\n✓ Restauración completada desde", filePath.replace(root + "/", ""));
      console.log("  Proyecto:", projectRef);
      return;
    } catch (e) {
      lastErr = e;
      console.log("Intento fallido con esta conexión, probando otra...");
    }
  }

  console.error("No se pudo restaurar:", lastErr?.message || lastErr);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
