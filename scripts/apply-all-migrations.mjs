/**
 * Aplica todas las migraciones pendientes en supabase/migrations/ (orden alfabético).
 * Registra versiones en public.schema_migrations para no repetir.
 *
 * Uso:
 *   node scripts/apply-all-migrations.mjs
 *   npm run db:migrate
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationsDir = resolve(root, "supabase/migrations");

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

const env = loadEnv();
const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];

const BOOTSTRAP = `
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
`;

async function getDb() {
  const pass = env.SUPABASE_DB_PASSWORD;
  if (!pass || !projectRef) {
    throw new Error("Falta SUPABASE_DB_PASSWORD o NEXT_PUBLIC_SUPABASE_URL en .env.local");
  }
  const encoded = encodeURIComponent(pass);
  const urls = [
    env.DATABASE_URL,
    `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  ].filter(Boolean);

  const { default: postgres } = await import("postgres");
  let lastErr;
  for (const dbUrl of urls) {
    const db = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 15 });
    try {
      await db.unsafe("select 1");
      return db;
    } catch (e) {
      lastErr = e;
      try { await db.end({ timeout: 1 }); } catch { /* ignore */ }
    }
  }
  throw lastErr;
}

async function main() {
  console.log("Proyecto:", projectRef);
  const db = await getDb();

  await db.unsafe(BOOTSTRAP);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = await db`select version from public.schema_migrations`;
  let applied = new Set(appliedRows.map((r) => r.version));

  if (applied.size === 0) {
    const legacy = await db`
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'voice_agents'
      limit 1
    `;
    if (legacy.length > 0) {
      for (const file of files) {
        const version = basename(file, ".sql");
        await db`insert into public.schema_migrations (version) values (${version}) on conflict do nothing`;
      }
      applied = new Set(files.map((f) => basename(f, ".sql")));
      console.log("Base existente detectada — migraciones previas marcadas como aplicadas.");
    }
  }

  let count = 0;
  for (const file of files) {
    const version = basename(file, ".sql");
    if (applied.has(version)) {
      console.log("  skip", file);
      continue;
    }
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    console.log("  apply", file, "...");
    await db.unsafe(sql);
    await db`insert into public.schema_migrations (version) values (${version})`;
    count++;
    console.log("  ok", file);
  }

  await db.end({ timeout: 5 });
  console.log(count === 0 ? "Sin migraciones pendientes." : `Aplicadas ${count} migración(es).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
