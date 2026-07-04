import { getCallEngineRules } from "@/lib/call-engine/platform-config";
import {
  releaseCampaignDialerTick,
  tryAcquireCampaignDialerTick,
} from "@/lib/call-engine/dialer-lock";
import { runCampaignDialerTick, type DialerTickResult } from "@/lib/call-engine/dialer";
import { syncOpenElevenLabsCampaignCalls } from "@/lib/elevenlabs/sync-open-campaign-calls";
import { adminClient } from "@/lib/voice-agents-server";

/** Mínimo entre ticks forzados (activación de campaña). */
const ACTIVATION_DEBOUNCE_SECONDS = 15;

/** Cada cuánto el scheduler revisa si toca tick (no confundir con tick_minutes). */
const SCHEDULER_POLL_MS = 60_000;

let schedulerStarted = false;

/**
 * Ejecuta un ciclo del marcador si corresponde.
 * @param force true = activación de campaña (debounce corto, ignora tick_minutes)
 */
export async function runDialerTickIfDue(force = false): Promise<DialerTickResult | null> {
  const db = adminClient();
  const rules = await getCallEngineRules(db);
  if (!rules.enabled) return null;

  const acquired = await tryAcquireCampaignDialerTick(db, {
    force,
    minGapSeconds: force ? ACTIVATION_DEBOUNCE_SECONDS : rules.tick_minutes * 60,
  });
  if (!acquired) return null;

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
  } finally {
    await releaseCampaignDialerTick(db);
  }
}

/** Disparo inmediato al activar/reanudar una campaña (no bloquea la respuesta HTTP). */
export function triggerCampaignDialerOnActivation(): void {
  void runDialerTickIfDue(true).catch(() => {});
}

/**
 * Arranca el scheduler en procesos long-running (server.ts / Coolify).
 * Desactivar con CAMPAIGN_DIALER_SCHEDULER=0.
 * Si CRON_SECRET está definido, se asume cron externo y no se hace poll interno.
 */
export function startCampaignDialerScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (process.env.CAMPAIGN_DIALER_SCHEDULER === "0") {
    console.info("[dialer-scheduler] desactivado (CAMPAIGN_DIALER_SCHEDULER=0)");
    return;
  }

  if (process.env.CRON_SECRET) {
    console.info(
      "[dialer-scheduler] poll interno omitido — cron externo en /api/cron/campaign-dialer (CRON_SECRET definido)"
    );
    return;
  }

  console.info(
    `[dialer-scheduler] activo — revisa cada ${SCHEDULER_POLL_MS / 1000}s, intervalo según reglas admin`
  );

  setInterval(() => {
    void runDialerTickIfDue(false).catch(() => {});
  }, SCHEDULER_POLL_MS);

  setTimeout(() => {
    void runDialerTickIfDue(false).catch(() => {});
  }, 20_000);
}
