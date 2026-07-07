/**
 * Re-sincroniza todos los agentes premium (ElevenLabs) con la config actual de Noova.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/resync-all-premium-agents.mjs
 *   npx tsx --env-file=.env.local scripts/resync-all-premium-agents.mjs --org "marketnnova"
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const orgFilter = process.argv.includes("--org")
  ? process.argv[process.argv.indexOf("--org") + 1]?.toLowerCase()
  : null;

const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#"))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

for (const [k, v] of Object.entries(env)) process.env[k] = v;

const { syncElevenLabsAgent } = await import("../src/lib/elevenlabs/sync-agent.ts");
const { resolveCompanyNameForAgent } = await import("../src/lib/elevenlabs/voice-agent-sync.ts");

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: agents, error } = await db
  .from("voice_agents")
  .select("id, name, prompt, source_template, elevenlabs_voice_id, temperature, elevenlabs_agent_id, user_id, company_context_id, organization_id")
  .eq("voice_provider", "elevenlabs")
  .not("elevenlabs_agent_id", "is", null);

if (error) {
  console.error(error.message);
  process.exit(1);
}

let rows = agents ?? [];
if (orgFilter) {
  const { data: orgs } = await db.from("organizations").select("id, name").ilike("name", `%${orgFilter}%`);
  const orgIds = new Set((orgs ?? []).map(o => o.id));
  rows = rows.filter(a => a.organization_id && orgIds.has(a.organization_id));
  console.log(`Filtro org "${orgFilter}": ${rows.length} agente(s)`);
}

if (!rows.length) {
  console.log("Sin agentes premium para sincronizar");
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const agent of rows) {
  try {
    const companyName = await resolveCompanyNameForAgent(db, agent.user_id, agent.company_context_id);
    const result = await syncElevenLabsAgent({
      name: agent.name,
      prompt: agent.prompt,
      purposeId: agent.source_template,
      elevenlabsVoiceId: agent.elevenlabs_voice_id,
      temperature: agent.temperature,
      existingAgentId: agent.elevenlabs_agent_id,
      companyName,
    });
    console.log("OK", agent.name, result.agentId);
    ok++;
  } catch (err) {
    console.error("FAIL", agent.name, err instanceof Error ? err.message : err);
    fail++;
  }
}

console.log(`Listo: ${ok} ok, ${fail} fallos de ${rows.length}`);
