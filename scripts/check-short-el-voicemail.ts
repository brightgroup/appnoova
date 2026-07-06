/**
 * Revisa transcripciones de llamadas EL cortas para detectar buzones mal etiquetados.
 */
import { createClient } from "@supabase/supabase-js";
import { getElevenLabsConversation } from "../src/lib/elevenlabs/outbound-call";
import { transcriptIndicatesVoicemail } from "../src/lib/voice-voicemail-detection";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: calls } = await db
    .from("voice_agent_calls")
    .select("id, phone_number, duration_sec, credits, status, in_voicemail, transcript, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  const el = (calls ?? []).filter(c => {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    return m.voice_provider === "elevenlabs" || String(m.conversation_id ?? "").startsWith("conv_");
  });

  const short = el.filter(c => Number(c.duration_sec) > 0 && Number(c.duration_sec) <= 25 && Number(c.credits) > 0);

  console.log(`Llamadas EL cortas con cobro: ${short.length}\n`);

  for (const c of short) {
    const m = (c.metadata ?? {}) as Record<string, unknown>;
    const convId = String(m.conversation_id ?? "");
    let vmFromDb = transcriptIndicatesVoicemail((c.transcript as { role: string; text: string }[]) ?? []);
    let vmFromEl = false;
    let elDuration = c.duration_sec;

    if (convId.startsWith("conv_")) {
      try {
        const conv = await getElevenLabsConversation(convId);
        vmFromEl = conv.voicemailDetected;
        elDuration = conv.callDurationSecs;
        if (!vmFromDb) vmFromDb = transcriptIndicatesVoicemail(conv.transcript);
      } catch (e) {
        console.log(`  (no se pudo leer EL: ${e instanceof Error ? e.message : e})`);
      }
    }

    const isVm = vmFromDb || vmFromEl || c.in_voicemail;
    const flag = isVm ? "⚠ BUZÓN COBRADO" : "  conversación";
    console.log(`${flag} | ${c.created_at?.slice(0, 19)} | ${c.phone_number} | ${elDuration}s | credits=${c.credits}`);
    console.log(`  vm_db=${vmFromDb} vm_el=${vmFromEl} conv=${convId.slice(0, 32)}`);
    const tx = ((c.transcript as { text?: string }[]) ?? []).map(t => t.text).join(" ").slice(0, 120);
    if (tx) console.log(`  tx: ${tx}...`);
    console.log("");
  }
}

main().catch(console.error);
