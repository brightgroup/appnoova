/** Re-sincroniza un agente premium con ElevenLabs. Uso: node scripts/resync-premium-agent.mjs [agent_uuid] */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentId = process.argv[2] || "3e6b3e0a-7768-4cfc-aa33-acf26c95772c";

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: agent, error } = await db.from("voice_agents").select("*").eq("id", agentId).single();
if (error || !agent) {
  console.error(error?.message || "Agente no encontrado");
  process.exit(1);
}

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

console.log("OK", agent.name, result);
