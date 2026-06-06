import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadEnv() {
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

export function getProjectRef(env) {
  return (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
}

/** URLs de conexión Postgres (misma lógica que migraciones). */
export function getPostgresUrls(env) {
  const projectRef = getProjectRef(env);
  const pass = env.SUPABASE_DB_PASSWORD;
  if (!pass || !projectRef) return [];

  const encoded = encodeURIComponent(pass);
  return [
    env.DATABASE_URL,
    `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${projectRef}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encoded}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?options=reference%3D${projectRef}`
  ].filter(Boolean);
}

export { root };
