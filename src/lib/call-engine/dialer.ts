import { resolveElevenLabsPhoneLine } from "@/lib/elevenlabs/phone-line";
import { resolvePlatformSipConfig } from "@/lib/elevenlabs/sip-config";
import { billingBlockedMessage, checkBillingForOrg } from "@/lib/billing/meter";
import { releaseStuckCampaignRows } from "@/lib/call-engine/campaign-audience-status";
import { syncOpenElevenLabsCampaignCalls, syncStuckCampaignScreeningCalls, reconcileFinalizedInProgressCampaignCalls, reconcileStaleInProgressCampaignCalls, backfillMissingCampaignAudio } from "@/lib/elevenlabs/sync-open-campaign-calls";
import {
  bindCampaignCallControlId,
  cancelReservedCampaignCall,
  createCampaignOutboundCallSession,
} from "@/lib/call-engine/campaign-call-session";
import { countCampaignDialerActiveSlots } from "@/lib/call-engine/dialer-lock";
import { getCallEngineRules, type CallEngineRules } from "@/lib/call-engine/platform-config";
import { campaignLocalDateKey, isCampaignInSchedule } from "@/lib/call-engine/campaign-schedule";
import { buildCampaignCallPrompt } from "@/lib/campaigns/render-prompt";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import { tryAutoCompleteActiveCampaigns } from "@/lib/call-engine/campaign-completion";
import { loadVoiceAgentForCall } from "@/lib/telephony/load-voice-agent";
import { telnyxPlaceCall } from "@/lib/telephony/telnyx-call-control";
import { adminClient } from "@/lib/voice-agents-server";
import {
  contactSuppressedForCalls,
  dispositionFromPlacementError,
  resolveAudienceStatusAfterAttempt,
  type CampaignTechnicalDisposition,
} from "@/lib/call-engine/campaign-audience-status";
import type { CampaignAudienceTableRecord, CampaignCallStatus } from "@/types/voice-campaign";
import { randomUUID } from "crypto";

export interface DialerTickResult {
  ok: boolean;
  skipped?: string;
  rules: CallEngineRules;
  released_stuck: number;
  released_screening: number;
  active_calls: number;
  placed: number;
  completed_campaigns: string[];
  errors: { campaign_id: string; row_id: string; error: string }[];
}

interface EligibleRow {
  id: string;
  audience_table_id: string;
  phone_e164: string;
  contact_name: string | null;
  data: Record<string, string | number | boolean | null>;
  total_attempts: number;
  last_attempt_at: string | null;
  call_status: string;
  scheduled_call_at?: string | null;
  crm_contact_id?: string | null;
}

async function countActiveCampaignCalls(db: ReturnType<typeof adminClient>): Promise<number> {
  return countCampaignDialerActiveSlots(db);
}

function rowEligibleForDial(
  row: EligibleRow,
  rules: CallEngineRules,
  attemptsPerDay: number,
  maxAttempts: number,
  localDateKey: string,
  timezone: string
): boolean {
  if (!row.phone_e164?.trim()) return false;
  if (row.total_attempts >= maxAttempts) return false;

  if (row.call_status === "retry" && row.last_attempt_at) {
    const gapMs = rules.retry_gap_minutes * 60_000;
    if (Date.now() - new Date(row.last_attempt_at).getTime() < gapMs) return false;
  }

  if (attemptsPerDay <= 1 && row.last_attempt_at && row.total_attempts > 0) {
    const lastLocal = campaignLocalDateKey(
      {
        timezone,
        start_date: "",
        end_date: null,
        day_slots: {},
        max_attempts_per_contact: maxAttempts,
        attempts_per_day: attemptsPerDay,
      },
      new Date(row.last_attempt_at)
    );
    if (lastLocal === localDateKey) return false;
  }

  return true;
}

/**
 * Números que YA tienen una llamada en curso (en cualquier campaña): filas de
 * audiencia en "calling" o llamadas premium "in_progress". Sirve para no marcar
 * dos veces el mismo número cuando una persona está repetida en varios lotes.
 */
async function loadInFlightNumbers(db: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>();
  const { data: rows } = await db
    .from("campaign_audience_rows")
    .select("phone_e164")
    .eq("call_status", "calling");
  for (const r of rows ?? []) if (r.phone_e164) set.add(String(r.phone_e164));

  const { data: calls } = await db
    .from("voice_agent_calls")
    .select("phone_number")
    .eq("status", "in_progress")
    .not("campaign_id", "is", null);
  for (const c of calls ?? []) if (c.phone_number) set.add(String(c.phone_number));

  return set;
}

async function claimAudienceRow(
  db: ReturnType<typeof adminClient>,
  rowId: string
): Promise<EligibleRow | null> {
  const now = new Date().toISOString();
  const { data: current } = await db
    .from("campaign_audience_rows")
    .select("*")
    .eq("id", rowId)
    .in("call_status", ["pending", "retry"])
    .maybeSingle();

  if (!current) return null;

  const { data: claimed, error } = await db
    .from("campaign_audience_rows")
    .update({
      call_status: "calling",
      total_attempts: (Number(current.total_attempts) || 0) + 1,
      last_attempt_at: now,
      updated_at: now,
    })
    .eq("id", rowId)
    .in("call_status", ["pending", "retry"])
    .select("*")
    .maybeSingle();

  if (error || !claimed) return null;
  return claimed as EligibleRow;
}

async function revertClaimedRow(
  db: ReturnType<typeof adminClient>,
  rowId: string,
  rules: CallEngineRules,
  maxAttempts: number,
  disposition?: CampaignTechnicalDisposition
): Promise<void> {
  const { data: row } = await db
    .from("campaign_audience_rows")
    .select("total_attempts")
    .eq("id", rowId)
    .maybeSingle();

  const attempts = Number(row?.total_attempts) || 0;
  const resolved = disposition
    ? resolveAudienceStatusAfterAttempt({
        disposition,
        attempts,
        maxAttempts,
        retryGapMinutes: rules.retry_gap_minutes,
      })
    : {
        call_status: (attempts >= maxAttempts ? "failed" : "retry") as CampaignCallStatus,
        scheduled_call_at:
          attempts >= maxAttempts
            ? null
            : new Date(Date.now() + rules.retry_gap_minutes * 60_000).toISOString(),
      };

  await db
    .from("campaign_audience_rows")
    .update({
      call_status: resolved.call_status,
      scheduled_call_at: resolved.scheduled_call_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .eq("call_status", "calling");
}

async function placeCampaignCall(input: {
  campaign: ReturnType<typeof toVoiceCampaignRecord>;
  row: EligibleRow;
  audienceTable: CampaignAudienceTableRecord;
  rules: CallEngineRules;
}): Promise<void> {
  const db = adminClient();
  const { campaign, row, audienceTable, rules } = input;

  if (!campaign.voice_agent_id || !campaign.audience_table_id) {
    throw new Error("Campaña sin agente o audiencia");
  }

  const billing = await checkBillingForOrg(db, campaign.organization_id);
  if (!billing.allowed) {
    throw new Error(billingBlockedMessage(billing.reason));
  }

  const [{ data: phone }, { data: agentRow }] = await Promise.all([
    db
      .from("phone_numbers")
      .select(
        "id, e164, friendly_name, voice_agent_id, voice_config, elevenlabs_phone_number_id, elevenlabs_sync_error, elevenlabs_synced_at"
      )
      .eq("voice_agent_id", campaign.voice_agent_id)
      .eq("user_id", campaign.user_id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    db
      .from("voice_agents")
      .select("id, name, voice_provider, elevenlabs_agent_id, prompt")
      .eq("id", campaign.voice_agent_id)
      .eq("user_id", campaign.user_id)
      .maybeSingle(),
  ]);

  if (!phone?.e164) throw new Error("Sin línea telefónica activa para el agente");
  if (!agentRow) throw new Error("Agente no encontrado");

  const loaded = await loadVoiceAgentForCall(campaign.voice_agent_id, campaign.user_id);
  if (!loaded) throw new Error("No se pudo cargar configuración del agente");

  const rowData = (row.data ?? {}) as Record<string, string | number | boolean | null>;
  const campaignPrompt = buildCampaignCallPrompt({
    promptTemplate: campaign.prompt_template,
    agentPrompt: loaded.config.prompt,
    row: rowData,
    mapping: campaign.field_mapping,
    columns: audienceTable.columns,
  });

  const destination = row.phone_e164.trim();
  const contactName = row.contact_name?.trim() || destination;
  const reserveId = `pending:${randomUUID()}`;

  const reserveSession = async (
    voiceProvider: "google" | "elevenlabs",
    from: string,
    opts?: { elDeferredAmd?: boolean }
  ) => {
    return createCampaignOutboundCallSession({
      userId: campaign.user_id,
      voiceAgentId: campaign.voice_agent_id!,
      callControlId: reserveId,
      phoneNumberId: phone.id,
      campaignId: campaign.id,
      campaignAudienceRowId: row.id,
      from,
      to: destination,
      agentName: loaded.agentName,
      contactName,
      campaignName: campaign.name,
      voiceProvider,
      promptOverride: campaignPrompt,
      elDeferredAmd: opts?.elDeferredAmd,
    });
  };

  const telnyx = (phone.voice_config as { telnyx?: { connection_id?: string; call_control_app_id?: string } })
    ?.telnyx;
  const connectionId =
    telnyx?.connection_id ||
    telnyx?.call_control_app_id ||
    process.env.TELNYX_CONNECTION_ID?.trim();

  if (!connectionId) throw new Error("TELNYX_CONNECTION_ID no configurado");

  const clientState = {
    type: "campaign_outbound",
    user_id: campaign.user_id,
    voice_agent_id: campaign.voice_agent_id,
    phone_number_id: phone.id,
    campaign_id: campaign.id,
    campaign_audience_row_id: row.id,
    destination_e164: destination,
  };

  if (loaded.config.voice_provider === "elevenlabs") {
    if (!agentRow.elevenlabs_agent_id) {
      throw new Error("Agente premium sin sincronizar");
    }
    await resolvePlatformSipConfig();
    const line = await resolveElevenLabsPhoneLine(phone, {
      elevenlabsAgentId: agentRow.elevenlabs_agent_id,
      resync: !phone.elevenlabs_phone_number_id,
    });
    if (!line.configured || !line.phoneNumberId) {
      throw new Error(line.syncError ?? "Línea premium no configurada");
    }

    // AMD Telnyx primero: buzón de voz no conecta ElevenLabs (sin cobro premium).
    const callId = await reserveSession("elevenlabs", phone.e164, { elDeferredAmd: true });
    try {
      const { callControlId } = await telnyxPlaceCall({
        connectionId,
        from: phone.e164,
        to: destination,
        clientState,
        timeoutSecs: rules.ring_timeout_seconds,
        amdMode: "premium",
        amdProfile: "campaign_strict",
      });
      await bindCampaignCallControlId(callId, callControlId);
    } catch (err) {
      await cancelReservedCampaignCall(callId);
      throw err;
    }
    return;
  }

  const callId = await reserveSession("google", phone.e164);
  try {
    const { callControlId } = await telnyxPlaceCall({
      connectionId,
      from: phone.e164,
      to: destination,
      clientState,
      timeoutSecs: rules.ring_timeout_seconds,
    });
    await bindCampaignCallControlId(callId, callControlId);
  } catch (err) {
    await cancelReservedCampaignCall(callId);
    throw err;
  }
}

export async function runCampaignDialerTick(): Promise<DialerTickResult> {
  const result = await executeCampaignDialerTick();
  try {
    result.completed_campaigns = await tryAutoCompleteActiveCampaigns();
  } catch (err) {
    console.error("[campaign-dialer] auto-complete:", err);
    result.completed_campaigns = [];
  }
  return result;
}

async function executeCampaignDialerTick(): Promise<DialerTickResult> {
  const db = adminClient();
  const rules = await getCallEngineRules(db);

  if (!rules.enabled) {
    return {
      ok: true,
      skipped: "motor_disabled",
      rules,
      released_stuck: 0,
      released_screening: 0,
      active_calls: 0,
      placed: 0,
      completed_campaigns: [],
      errors: [],
    };
  }

  const releasedStuck = await releaseStuckCampaignRows(3);
  const releasedScreening = await syncStuckCampaignScreeningCalls(4);
  const reconciledFinalized = await reconcileFinalizedInProgressCampaignCalls();
  const reconciledStale = await reconcileStaleInProgressCampaignCalls(20);
  await syncOpenElevenLabsCampaignCalls();
  await backfillMissingCampaignAudio(8);
  const activeCalls = await countActiveCampaignCalls(db);
  const available = rules.max_concurrent - activeCalls;

  if (available <= 0) {
    return {
      ok: true,
      skipped: "max_concurrent",
      rules,
      released_stuck: releasedStuck,
      released_screening: releasedScreening,
      active_calls: activeCalls,
      placed: 0,
      completed_campaigns: [],
      errors: [],
    };
  }

  const batchLimit = Math.min(rules.batch_size, available);
  const nowIso = new Date().toISOString();

  const { data: campaignRows, error: campErr } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("status", "active")
    .not("voice_agent_id", "is", null)
    .not("audience_table_id", "is", null);

  if (campErr) {
    throw new Error(campErr.message);
  }

  const campaigns = (campaignRows ?? []).map((r) => toVoiceCampaignRecord(r as Record<string, unknown>));
  const inSchedule = campaigns.filter((c) => isCampaignInSchedule(c.schedule_config));

  if (campaigns.length > 0 && inSchedule.length === 0) {
    return {
      ok: true,
      skipped: "outside_schedule",
      rules,
      released_stuck: releasedStuck,
      released_screening: releasedScreening,
      active_calls: activeCalls,
      placed: 0,
      completed_campaigns: [],
      errors: [],
    };
  }

  const candidates: { campaign: (typeof campaigns)[0]; row: EligibleRow; table: CampaignAudienceTableRecord }[] = [];

  for (const campaign of inSchedule) {
    const { data: tableRow } = await db
      .from("campaign_audience_tables")
      .select("*")
      .eq("id", campaign.audience_table_id!)
      .maybeSingle();

    if (!tableRow) continue;

    const audienceTable = {
      id: String(tableRow.id),
      organization_id: String(tableRow.organization_id),
      user_id: String(tableRow.user_id),
      name: String(tableRow.name ?? ""),
      description: tableRow.description ? String(tableRow.description) : null,
      columns: Array.isArray(tableRow.columns) ? tableRow.columns : [],
      row_count: Number(tableRow.row_count ?? 0),
      source_file_name: tableRow.source_file_name ? String(tableRow.source_file_name) : null,
      created_at: String(tableRow.created_at ?? ""),
      updated_at: String(tableRow.updated_at ?? ""),
    } satisfies CampaignAudienceTableRecord;

    const localDateKey = campaignLocalDateKey(campaign.schedule_config);
    const maxAttempts = campaign.schedule_config.max_attempts_per_contact ?? 3;
    const attemptsPerDay = campaign.schedule_config.attempts_per_day ?? 1;

    const { data: rows } = await db
      .from("campaign_audience_rows")
      .select("*")
      .eq("audience_table_id", campaign.audience_table_id!)
      .eq("is_active", true)
      .in("call_status", ["pending", "retry"])
      .not("phone_e164", "is", null)
      .or(`scheduled_call_at.is.null,scheduled_call_at.lte.${nowIso}`)
      .order("scheduled_call_at", { ascending: true, nullsFirst: true })
      .limit(batchLimit * 2);

    for (const raw of rows ?? []) {
      const row = raw as EligibleRow;
      if (!rowEligibleForDial(row, rules, attemptsPerDay, maxAttempts, localDateKey, campaign.schedule_config.timezone)) continue;
      candidates.push({ campaign, row, table: audienceTable });
      if (candidates.length >= batchLimit * 3) break;
    }
  }

  candidates.sort(
    (a, b) =>
      String(a.row.scheduled_call_at ?? "").localeCompare(String(b.row.scheduled_call_at ?? ""))
  );

  let placed = 0;
  const errors: DialerTickResult["errors"] = [];

  // Candado por número: nunca dos llamadas en curso al mismo número a la vez
  // (aunque la persona esté repetida en varios lotes/campañas).
  const inFlightNumbers = await loadInFlightNumbers(db);

  for (const { campaign, row, table } of candidates) {
    if (placed >= batchLimit) break;

    const slotsNow = await countActiveCampaignCalls(db);
    if (slotsNow >= rules.max_concurrent) break;

    // Si ese número ya tiene una llamada en curso, se salta este tick y se
    // reintentará en el siguiente (queda en pending/retry, no se consume intento).
    if (row.phone_e164 && inFlightNumbers.has(String(row.phone_e164))) continue;

    // Regla: "no contactar" se revisa antes de cada llamada, no solo al importar.
    const suppressed = await contactSuppressedForCalls({
      crmContactId: row.crm_contact_id,
      phoneE164: row.phone_e164,
      userId: campaign.user_id,
    });
    if (suppressed) {
      await db
        .from("campaign_audience_rows")
        .update({
          call_status: "skipped",
          excluded_reason: "no_contactar",
          scheduled_call_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .in("call_status", ["pending", "retry"]);
      continue;
    }

    const claimed = await claimAudienceRow(db, row.id);
    if (!claimed) continue;

    const slotsAfterClaim = await countActiveCampaignCalls(db);
    // Permitir el cupo que acabamos de reclamar (la fila en "calling" sin sesión aún).
    if (slotsAfterClaim > rules.max_concurrent) {
      const maxAttempts = campaign.schedule_config.max_attempts_per_contact ?? 3;
      await revertClaimedRow(db, row.id, rules, maxAttempts);
      break;
    }

    try {
      await placeCampaignCall({ campaign, row: claimed, audienceTable: table, rules });
      placed += 1;
      if (claimed.phone_e164) inFlightNumbers.add(String(claimed.phone_e164));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al marcar";
      console.error("[campaign-dialer] place failed:", { campaignId: campaign.id, rowId: row.id, message });
      errors.push({ campaign_id: campaign.id, row_id: row.id, error: message });
      const maxAttempts = campaign.schedule_config.max_attempts_per_contact ?? 3;
      await revertClaimedRow(
        db,
        row.id,
        rules,
        maxAttempts,
        dispositionFromPlacementError(message)
      );
      break;
    }
  }

  return {
    ok: true,
    rules,
    released_stuck: releasedStuck,
    released_screening: releasedScreening,
    active_calls: activeCalls,
    placed,
    completed_campaigns: [],
    errors,
  };
}
