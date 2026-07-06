/**
 * Verifica que llamadas a buzón de voz ElevenLabs no generen cobro interno (Noova).
 * Uso: npx tsx --env-file=.env.local scripts/check-voicemail-billing.ts
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: calls, error } = await db
    .from("voice_agent_calls")
    .select(
      "id, phone_number, duration_sec, credits, status, status_label, in_voicemail, created_at, metadata, campaign_id"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const voicemailCalls = (calls ?? []).filter(c => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return (
      c.in_voicemail === true ||
      c.status === "voicemail" ||
      meta.outcome === "voicemail" ||
      meta.voicemail_detected === true ||
      String(c.status_label ?? "").toLowerCase().includes("buzón")
    );
  });

  const elVoicemail = voicemailCalls.filter(c => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return meta.voice_provider === "elevenlabs" || String(meta.conversation_id ?? "").startsWith("conv_");
  });

  const elAll = (calls ?? []).filter(c => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return meta.voice_provider === "elevenlabs" || String(meta.conversation_id ?? "").startsWith("conv_");
  });

  console.log(`\n=== Últimos 30 días ===`);
  console.log(`Total llamadas: ${calls?.length ?? 0}`);
  console.log(`ElevenLabs (todas): ${elAll.length}`);
  console.log(`Buzón de voz (todas): ${voicemailCalls.length}`);
  console.log(`Buzón ElevenLabs: ${elVoicemail.length}\n`);

  if (elVoicemail.length === 0) {
    console.log("No hay llamadas ElevenLabs a buzón en el periodo.");
    return;
  }

  const ids = elVoicemail.map(c => c.id);
  const { data: usage } = await db
    .from("usage_events")
    .select("id, reference_id, event_type, credits, quantity, metadata, created_at")
    .in("reference_id", ids)
    .eq("reference_type", "voice_agent_call");

  const usageByCall = new Map((usage ?? []).map(u => [u.reference_id, u]));

  let chargedVoicemail = 0;
  let okNoCharge = 0;

  console.log("Detalle buzón ElevenLabs:\n");
  for (const c of elVoicemail) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const usageRow = usageByCall.get(c.id);
    const hasUsageCharge = Boolean(usageRow && Number(usageRow.credits) > 0);
    const hasCallCredits = Number(c.credits) > 0;
    const charged = hasUsageCharge || hasCallCredits;

    if (charged) chargedVoicemail += 1;
    else okNoCharge += 1;

    const flag = charged ? "⚠ COBRO" : "✓ sin cobro";
    console.log(`${flag} | ${c.created_at?.slice(0, 19)} | ${c.phone_number}`);
    console.log(`       status=${c.status} credits=${c.credits} duration=${c.duration_sec}s`);
    console.log(`       label=${c.status_label}`);
    console.log(`       conv=${String(meta.conversation_id ?? "—").slice(0, 28)}`);
    console.log(`       agent_skipped=${meta.agent_skipped} el_deferred_amd=${meta.el_deferred_amd}`);
    if (usageRow) {
      console.log(`       usage_event: ${usageRow.event_type} credits=${usageRow.credits} min=${usageRow.quantity}`);
    }
    console.log("");
  }

  console.log(`\nResumen buzón ElevenLabs: ${okNoCharge} sin cobro, ${chargedVoicemail} con cobro indebido.`);

  // También: llamadas EL conectadas recientes para contexto
  const elConnected = elAll.filter(c => !elVoicemail.some(v => v.id === c.id) && Number(c.duration_sec) > 0);
  const elConnectedCharged = elConnected.filter(c => {
    const u = usageByCall.get(c.id);
    return Number(c.credits) > 0 || (u && Number(u.credits) > 0);
  });
  console.log(`\nElevenLabs con conversación (${elConnected.length}): ${elConnectedCharged.length} con cobro (esperado).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
