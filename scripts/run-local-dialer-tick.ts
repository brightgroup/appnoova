/**
 * Prueba local del marcador de campañas.
 * Uso: npx tsx scripts/run-local-dialer-tick.ts [--activate]
 */
import { readFileSync } from "fs";
import { join } from "path";

function loadEnvLocal() {
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const activate = process.argv.includes("--activate");

async function main() {
  const { adminClient } = await import("../src/lib/voice-agents-server");
  const { runDialerTickIfDue } = await import("../src/lib/call-engine/dialer-scheduler");
  const { getCallEngineRules } = await import("../src/lib/call-engine/platform-config");

  const db = adminClient();
  const rules = await getCallEngineRules(db);
  console.log("Motor:", rules.enabled ? "ON" : "OFF", rules);

  if (activate) {
    const { data: paused } = await db
      .from("voice_campaigns")
      .select("id, name, status")
      .eq("status", "paused")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paused) {
      await db.from("voice_campaigns").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", paused.id);
      console.log(`Campaña activada: ${paused.name}`);
    } else {
      console.log("No hay campaña pausada para activar.");
    }
  }

  console.log("Ejecutando tick del marcador…");
  const result = await runDialerTickIfDue(true);
  if (!result) {
    console.log("Tick omitido (motor OFF o debounce reciente).");
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
