/**
 * Prueba local del marcador — node scripts/test-campaign-dialer.mjs
 * Requiere .env.local cargado (dotenv no necesario si exportas vars o usas tsx con env).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);

async function main() {
  const { data: rulesRow } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "call_engine_rules")
    .maybeSingle();

  const rules = rulesRow?.value ?? { enabled: false };
  console.log("\n=== Motor de llamadas ===");
  console.log(JSON.stringify(rules, null, 2));

  const { data: campaigns } = await db
    .from("voice_campaigns")
    .select("id, name, status, voice_agent_id, audience_table_id")
    .in("status", ["active", "paused", "draft"])
    .order("updated_at", { ascending: false })
    .limit(5);

  console.log("\n=== Campañas recientes ===");
  for (const c of campaigns ?? []) {
    console.log(`- [${c.status}] ${c.name} (${c.id.slice(0, 8)}…)`);
    if (c.audience_table_id && c.status === "active") {
      const { data: rows } = await db
        .from("campaign_audience_rows")
        .select("id, contact_name, phone_e164, call_status, scheduled_call_at, total_attempts")
        .eq("audience_table_id", c.audience_table_id)
        .eq("is_active", true)
        .in("call_status", ["pending", "retry", "calling"])
        .limit(5);
      for (const r of rows ?? []) {
        console.log(
          `    · ${r.contact_name ?? "?"} ${r.phone_e164} → ${r.call_status} (intentos: ${r.total_attempts})`
        );
      }
    }
  }

  const { count: inProgress } = await db
    .from("voice_agent_calls")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_progress")
    .not("campaign_id", "is", null);

  console.log(`\n=== Llamadas de campaña en curso: ${inProgress ?? 0} ===\n`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
