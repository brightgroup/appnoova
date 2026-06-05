/**
 * Aplica APPLY_IN_SUPABASE.sql al proyecto remoto.
 * Usa SUPABASE_DB_PASSWORD o DATABASE_URL en .env.local si existe.
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
const sqlPath = resolve(root, "supabase/APPLY_IN_SUPABASE.sql");
const sql = readFileSync(sqlPath, "utf8");

async function viaPostgres() {
  const dbUrl =
    env.DATABASE_URL ||
    (env.SUPABASE_DB_PASSWORD && projectRef
      ? `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@db.${projectRef}.supabase.co:5432/postgres`
      : null);

  if (!dbUrl) return { ok: false, reason: "no_database_url" };

  const { default: postgres } = await import("postgres");
  const db = postgres(dbUrl, { ssl: "require", max: 1 });
  try {
    await db.unsafe(sql);
    return { ok: true, method: "postgres" };
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function viaManagementApi() {
  const token = env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !projectRef) return { ok: false, reason: "no_token" };

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
  const { data, error } = await db.from("voice_agents").select("id, source_template, contacts_count").limit(3);
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: data?.length ?? 0, sample: data?.[0] };
}

async function main() {
  console.log("Proyecto:", projectRef);
  console.log("Aplicando migración...");

  let result = await viaPostgres();
  if (!result.ok) {
    console.log("Postgres directo:", result.reason);
    result = await viaManagementApi();
  }

  if (!result.ok) {
    console.error("No se pudo aplicar SQL automáticamente:", result);
    console.error("\nAñade a .env.local una de estas variables y vuelve a ejecutar:");
    console.error("  SUPABASE_DB_PASSWORD=<contraseña de Database Settings>");
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
