/**
 * Aplica SQL de migración al proyecto Supabase remoto.
 * Usa SUPABASE_DB_PASSWORD o DATABASE_URL en .env.local.
 *
 * Uso:
 *   node scripts/apply-supabase-migration.mjs
 *   node scripts/apply-supabase-migration.mjs supabase/migrations/004_company_contexts.sql
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

const env = loadEnv();
const projectRef = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
const sqlArg = process.argv[2];
const sqlPath = sqlArg
  ? resolve(root, sqlArg)
  : resolve(root, "supabase/APPLY_IN_SUPABASE.sql");
const sql = readFileSync(sqlPath, "utf8");

async function viaPostgres() {
  const pass = env.SUPABASE_DB_PASSWORD;
  if (!pass || !projectRef) return { ok: false, reason: "no_database_url" };

  const encoded = encodeURIComponent(pass);
  const urls = [
    env.DATABASE_URL,
    `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encoded}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3D${projectRef}`
  ].filter(Boolean);

  const { default: postgres } = await import("postgres");
  let lastErr;

  for (const dbUrl of urls) {
    const db = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 15 });
    try {
      await db.unsafe(sql);
      await db.end({ timeout: 5 });
      return { ok: true, method: "postgres" };
    } catch (e) {
      lastErr = e;
      try { await db.end({ timeout: 1 }); } catch { /* ignore */ }
    }
  }

  throw lastErr;
}

async function viaManagementApi() {
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token || !projectRef) return { ok: false, reason: "no_access_token" };

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: sql })
    }
  );

  const text = await res.text();
  if (!res.ok) return { ok: false, reason: "mgmt_api", status: res.status, body: text };

  return { ok: true, method: "management_api", body: text };
}

async function verify() {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db.from("company_contexts").select("id").limit(1);
  if (error) return { ok: false, error: error.message };
  const { error: colErr } = await db.from("voice_agents").select("company_context_id").limit(1);
  return {
    ok: true,
    company_contexts: data?.length ?? 0,
    voice_agents_column: colErr ? colErr.message : "ok"
  };
}

async function main() {
  console.log("Proyecto:", projectRef);
  console.log("SQL:", sqlPath.replace(root + "/", ""));
  console.log("Aplicando migración...");

  let result;
  try {
    result = await viaPostgres();
  } catch (e) {
    console.log("Postgres directo:", e.message || e);
    result = { ok: false };
  }
  if (!result?.ok) {
    result = await viaManagementApi();
  }

  if (!result.ok) {
    console.error("No se pudo aplicar SQL automáticamente:", result);
    console.error("\nAñade a .env.local UNA de estas variables y vuelve a ejecutar:");
    console.error("  SUPABASE_DB_PASSWORD=<contraseña en Settings → Database>");
    console.error("  SUPABASE_ACCESS_TOKEN=<token personal en supabase.com/dashboard/account/tokens>");
    console.error("  DATABASE_URL=postgresql://postgres:...@db....supabase.co:5432/postgres");
    process.exit(1);
  }

  console.log("Migración aplicada vía", result.method);
  const check = await verify();
  console.log("Verificación:", JSON.stringify(check, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
