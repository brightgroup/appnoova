import { getCallEngineRules, saveSetting } from "@/lib/call-engine/platform-config";
import { runCampaignDialerTick, type DialerTickResult } from "@/lib/call-engine/dialer";
import { syncOpenElevenLabsCampaignCalls } from "@/lib/elevenlabs/sync-open-campaign-calls";
import { adminClient } from "@/lib/voice-agents-server";

export const LAST_DIALER_TICK_KEY = "call_engine_last_tick";

/** Mínimo entre ticks forzados (activación de campaña). */
const ACTIVATION_DEBOUNCE_MS = 15_000;

/** Cada cuánto el scheduler revisa si toca tick (no confundir con tick_minutes). */
const SCHEDULER_POLL_MS = 60_000;

let schedulerStarted = false;

async function readLastTickMs(db: ReturnType<typeof adminClient>): Promise<number> {
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", LAST_DIALER_TICK_KEY)
    .maybeSingle();
  const at = (data?.value as { at?: string } | null)?.at;
  if (!at) return 0;
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

async function recordTick(db: ReturnType<typeof adminClient>): Promise<void> {
  await saveSetting(db, LAST_DIALER_TICK_KEY, { at: new Date().toISOString() }, "system");
}

/**
 * Ejecuta un ciclo del marcador si corresponde.
 * @param force true = activación de campaña (debounce corto, ignora tick_minutes)
 */
export async function runDialerTickIfDue(force = false): Promise<DialerTickResult | null> {
  const db = adminClient();
  const rules = await getCallEngineRules(db);
  if (!rules.enabled) return null;

  const now = Date.now();
  const lastTick = await readLastTickMs(db);
  const minGapMs = force ? ACTIVATION_DEBOUNCE_MS : rules.tick_minutes * 60_000;

  if (lastTick > 0 && now - lastTick < minGapMs) {
    return null;
  }

  await recordTick(db);

  try {
    await syncOpenElevenLabsCampaignCalls();
    const result = await runCampaignDialerTick();
    console.info("[dialer-scheduler] tick", {
      force,
      placed: result.placed,
      skipped: result.skipped,
      active_calls: result.active_calls,
      errors: result.errors.length,
    });
    return result;
  } catch (err) {
    console.error("[dialer-scheduler] tick error:", err);
    throw err;
  }
}

/** Disparo inmediato al activar/reanudar una campaña (no bloquea la respuesta HTTP). */
export function triggerCampaignDialerOnActivation(): void {
  void runDialerTickIfDue(true).catch(() => {});
}

/**
 * Arranca el scheduler en procesos long-running (server.ts / Coolify).
 * Desactivar con CAMPAIGN_DIALER_SCHEDULER=0.
 */
export function startCampaignDialerScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (process.env.CAMPAIGN_DIALER_SCHEDULER === "0") {
    console.info("[dialer-scheduler] desactivado (CAMPAIGN_DIALER_SCHEDULER=0)");
    return;
  }

  console.info(
    `[dialer-scheduler] activo — revisa cada ${SCHEDULER_POLL_MS / 1000}s, intervalo según reglas admin`
  );

  setInterval(() => {
    void runDialerTickIfDue(false).catch(() => {});
  }, SCHEDULER_POLL_MS);

  // Primer ciclo tras arranque (deja que Next termine de prepararse).
  setTimeout(() => {
    void runDialerTickIfDue(false).catch(() => {});
  }, 20_000);
}
