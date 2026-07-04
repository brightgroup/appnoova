import type { adminClient } from "@/lib/voice-agents-server";

type Db = ReturnType<typeof adminClient>;

async function countActiveCallsFallback(db: Db): Promise<number> {
  const { count, error } = await db
    .from("voice_agent_calls")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_progress")
    .not("campaign_id", "is", null);

  if (error) {
    console.error("[dialer-lock] count fallback:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Lock + debounce atómico antes de ejecutar un tick del marcador. */
export async function tryAcquireCampaignDialerTick(
  db: Db,
  input: { force: boolean; minGapSeconds: number }
): Promise<boolean> {
  const { data, error } = await db.rpc("try_acquire_campaign_dialer_tick", {
    p_force: input.force,
    p_min_gap_seconds: input.minGapSeconds,
    p_debounce_seconds: 15,
    p_lock_seconds: 120,
  });

  if (error) {
    if (error.message.includes("try_acquire_campaign_dialer_tick")) {
      console.warn("[dialer-lock] RPC no disponible — aplica migración 068");
      return true;
    }
    console.error("[dialer-lock] acquire:", error.message);
    return false;
  }

  return data === true;
}

export async function releaseCampaignDialerTick(db: Db): Promise<void> {
  const { error } = await db.rpc("release_campaign_dialer_tick");
  if (error && !error.message.includes("release_campaign_dialer_tick")) {
    console.error("[dialer-lock] release:", error.message);
  }
}

/** Llamadas in_progress + filas en calling sin sesión (ventana de reserva). */
export async function countCampaignDialerActiveSlots(db: Db): Promise<number> {
  const { data, error } = await db.rpc("count_campaign_dialer_active_slots", {
    p_calling_grace_minutes: 15,
  });

  if (error) {
    if (error.message.includes("count_campaign_dialer_active_slots")) {
      return countActiveCallsFallback(db);
    }
    console.error("[dialer-lock] count slots:", error.message);
    return countActiveCallsFallback(db);
  }

  return Number(data) || 0;
}
