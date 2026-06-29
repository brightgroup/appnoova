/**
 * Audita tablas public: RLS, políticas y conteo de filas.
 * Uso: node scripts/audit-supabase-security.mjs
 */
import { loadEnv, getPostgresUrls } from "./lib/load-env.mjs";

const AUDIT_SQL = `
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policy_count,
       COALESCE(s.n_live_tup, 0)::bigint AS row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
`;

async function main() {
  const env = loadEnv();
  const urls = getPostgresUrls(env);
  if (!urls.length) {
    console.error("Falta SUPABASE_DB_PASSWORD");
    process.exit(1);
  }

  const { default: postgres } = await import("postgres");
  let lastErr;
  for (const dbUrl of urls) {
    const db = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 15 });
    try {
      const rows = await db.unsafe(AUDIT_SQL);
      console.log(JSON.stringify(rows, null, 2));
      await db.end({ timeout: 5 });
      return;
    } catch (e) {
      lastErr = e;
      try {
        await db.end({ timeout: 1 });
      } catch {
        /* ignore */
      }
    }
  }
  console.error(lastErr);
  process.exit(1);
}

main();
