/**
 * Auditoría detallada de llamadas ElevenLabs recientes.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: calls } = await db
    .from("voice_agent_calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const el = (calls ?? []).filter(c => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.voice_provider === "elevenlabs" || String(m.conversation_id ?? "").startsWith("conv_");
  });

  const ids = el.map(c => c.id);
  const { data: usage } = await db
    .from("usage_events")
    .select("reference_id, event_type, credits, quantity, metadata")
    .in("reference_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .eq("reference_type", "voice_agent_call");

  const usageMap = new Map((usage ?? []).map(u => [u.reference_id, u]));

  console.log(`ElevenLabs recientes: ${el.length}\n`);

  for (const c of el.slice(0, 25)) {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    const u = usageMap.get(c.id);
    console.log(`${c.created_at?.slice(0, 19)} | ${c.phone_number}`);
    console.log(`  status=${c.status} in_vm=${c.in_voicemail} dur=${c.duration_sec}s credits=${c.credits}`);
    console.log(`  label=${c.status_label}`);
    console.log(`  outcome=${m.outcome} vm_detected=${m.voicemail_detected} agent_skipped=${m.agent_skipped}`);
    console.log(`  el_deferred=${m.el_deferred_amd} conv=${String(m.conversation_id ?? "").slice(0, 36)}`);
    console.log(`  campaign=${c.campaign_id ? "sí" : "no"}`);
    if (u) console.log(`  USAGE: ${u.event_type} credits=${u.credits} min=${u.quantity}`);
    else if (Number(c.credits) > 0) console.log(`  USAGE: (solo credits en call row)`);
    else console.log(`  USAGE: ninguno`);
    console.log("");
  }

  // Short calls (<15s) that might be voicemail but not tagged
  const suspicious = el.filter(c =>
    Number(c.duration_sec) > 0 &&
    Number(c.duration_sec) <= 20 &&
    !c.in_voicemail &&
    c.status !== "voicemail"
  );
  if (suspicious.length) {
    console.log(`\n--- Posibles buzones no etiquetados (${suspicious.length}) ---`);
    for (const c of suspicious) {
      console.log(`${c.created_at?.slice(0, 19)} ${c.phone_number} dur=${c.duration_sec}s credits=${c.credits} label=${c.status_label}`);
    }
  }
}

main().catch(console.error);
