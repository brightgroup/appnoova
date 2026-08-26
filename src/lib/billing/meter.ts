import type { SupabaseClient } from "@supabase/supabase-js";
import { ensurePricingConfig } from "@/lib/billing/pricing-config";
import {
  creditsForEvent,
  creditsFromUsdPrice,
  geminiCostUsd,
  usdToCop,
  voiceBillableMinutes,
  getTwilioWaUsdPerMsg,
  getMetaWaUsdPerMsg,
  getVoiceUsdPerMinute,
  getUsageMarginMultiplier,
  creditsForVoiceDuration,
  type UsageEventType,
  type VoiceBillingProvider,
} from "@/lib/billing/pricing";

export interface GeminiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Lee usageMetadata de una respuesta de @google/genai de forma defensiva. */
export function readGeminiUsage(response: unknown): GeminiUsage {
  const meta = (response as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata ?? {};
  const prompt = Number(meta.promptTokenCount ?? 0) || 0;
  const completion = Number(meta.candidatesTokenCount ?? 0) || 0;
  const total = Number(meta.totalTokenCount ?? 0) || prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

/**
 * Resuelve la organización de un usuario (org activa → org propia → primera membresía).
 * Usa el cliente con service role.
 */
export async function resolveOrgIdForUser(
  db: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: active } = await db
    .from("user_active_organization")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (active?.organization_id) return String(active.organization_id);

  const { data: owned } = await db
    .from("organizations")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (owned?.id) return String(owned.id);

  const { data: member } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at")
    .limit(1)
    .maybeSingle();
  if (member?.organization_id) return String(member.organization_id);

  return null;
}

export interface BillingState {
  allowed: boolean;
  reason: string;
  remaining: number | null;
  status?: string;
}

/** Verifica si una organización puede consumir (estado de suscripción + saldo). */
export async function checkBillingForOrg(
  db: SupabaseClient,
  organizationId: string
): Promise<BillingState> {
  const { data, error } = await db.rpc("billing_can_consume", { p_org: organizationId });
  if (error || !data) {
    // Ante error de facturación no bloqueamos el servicio.
    return { allowed: true, reason: "error", remaining: null };
  }
  const d = data as Record<string, unknown>;
  return {
    allowed: Boolean(d.allowed),
    reason: String(d.reason ?? ""),
    remaining: d.remaining == null ? null : Number(d.remaining),
    status: d.status ? String(d.status) : undefined
  };
}

/** Verifica el estado de facturación a partir de un userId. */
export async function checkBillingForUser(
  db: SupabaseClient,
  userId: string
): Promise<BillingState & { organizationId: string | null }> {
  const organizationId = await resolveOrgIdForUser(db, userId);
  if (!organizationId) {
    return { allowed: true, reason: "no_org", remaining: null, organizationId: null };
  }
  const state = await checkBillingForOrg(db, organizationId);
  return { ...state, organizationId };
}

export interface RecordUsageInput {
  db: SupabaseClient;
  organizationId: string;
  userId?: string | null;
  eventType: UsageEventType;
  channel?: string | null;
  /** Cantidad de unidades (ej: minutos de voz, # de mensajes Twilio). Default 1. */
  quantity?: number;
  /** Sobrescribe los créditos calculados. */
  creditsOverride?: number;
  provider?: "google" | "twilio" | "meta" | "telnyx" | "elevenlabs" | "anthropic" | "openai" | "hubspot" | null;
  model?: string | null;
  gemini?: GeminiUsage | null;
  /** Mensajes Twilio involucrados (entrante + saliente) para el costo real. */
  twilioMessages?: number;
  /** Minutos de voz para el costo real. */
  voiceMinutes?: number;
  /** Costo real explícito en USD (si se conoce). */
  providerCostUsdOverride?: number;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordUsageResult {
  ok: boolean;
  credits: number;
  remaining: number | null;
  blocked: boolean;
  error?: string;
}

/**
 * Registra un evento de consumo (ledger) y descuenta créditos de la billetera.
 * Pensado para llamarse después de la acción; debe envolverse en try/catch por el caller.
 */
export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
  await ensurePricingConfig(input.db);

  const quantity = input.quantity ?? 1;
  const flatCredits =
    input.creditsOverride != null
      ? Math.max(0, Math.round(input.creditsOverride))
      : creditsForEvent(input.eventType, quantity);

  // Costo real del proveedor
  let providerCostUsd = input.providerCostUsdOverride ?? 0;
  if (input.providerCostUsdOverride == null) {
    if (input.gemini) {
      providerCostUsd += geminiCostUsd(
        input.model,
        input.gemini.promptTokens,
        input.gemini.completionTokens
      );
    }
    if (input.twilioMessages) {
      // El campo se llama "twilioMessages" por historia, pero representa mensajes de
      // WhatsApp en general — la tarifa depende del proveedor real de entrega.
      const waRate = input.provider === "meta" ? getMetaWaUsdPerMsg() : getTwilioWaUsdPerMsg();
      providerCostUsd += input.twilioMessages * waRate;
    }
    if (input.voiceMinutes) {
      const voiceProvider: VoiceBillingProvider =
        input.eventType === "voice_premium" ? "elevenlabs" : "google";
      providerCostUsd += input.voiceMinutes * getVoiceUsdPerMinute(voiceProvider);
    }
  }

  // Piso de margen: si el turno resultó más caro que lo que el precio plano cubre
  // (imagen/PDF pesado, modelo premium tipo Claude), se cobra según el costo real ×
  // margen en vez del precio plano — así ningún turno se cobra por debajo de su costo.
  // No aplica cuando el caller ya fijó un `creditsOverride` explícito (trabajo interno
  // absorbido, o la línea de "entrega" de un evento ya cobrado en su línea hermana).
  const credits =
    input.creditsOverride != null
      ? flatCredits
      : Math.max(
          flatCredits,
          creditsFromUsdPrice(providerCostUsd * getUsageMarginMultiplier())
        );

  const providerCostCop = usdToCop(providerCostUsd);

  const { error: insertErr } = await input.db.from("usage_events").insert({
    organization_id: input.organizationId,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    channel: input.channel ?? null,
    quantity,
    credits_charged: credits,
    provider: input.provider ?? null,
    model: input.model ?? null,
    prompt_tokens: input.gemini?.promptTokens ?? null,
    completion_tokens: input.gemini?.completionTokens ?? null,
    total_tokens: input.gemini?.totalTokens ?? null,
    provider_cost_usd: providerCostUsd,
    provider_cost_cop: providerCostCop,
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    metadata: input.metadata ?? {}
  });

  if (insertErr) {
    // Conflicto de idempotencia: ya se registró, no volver a cobrar.
    if (insertErr.code === "23505") {
      return { ok: true, credits: 0, remaining: null, blocked: false };
    }
    return { ok: false, credits, remaining: null, blocked: false, error: insertErr.message };
  }

  const { data, error: chargeErr } = await input.db.rpc("billing_charge", {
    p_org: input.organizationId,
    p_credits: credits
  });

  if (chargeErr) {
    return { ok: true, credits, remaining: null, blocked: false, error: chargeErr.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    credits,
    remaining: row?.remaining == null ? null : Number(row.remaining),
    blocked: Boolean(row?.blocked)
  };
}

/**
 * Versión "fire-and-forget": registra consumo sin lanzar.
 * Conviene para no romper el flujo principal si falla la medición.
 */
export async function recordUsageSafe(input: RecordUsageInput): Promise<void> {
  try {
    const res = await recordUsage(input);
    if (!res.ok && res.error) {
      console.error(`[billing] recordUsage (${input.eventType}):`, res.error);
    }
  } catch (err) {
    console.error(`[billing] recordUsage (${input.eventType}) threw:`, err);
  }
}

/**
 * Registra el consumo de una llamada Gemini "suelta" (cotización, extracción de campos,
 * enriquecimiento de lead, captura de campaña) resolviendo la org desde el userId.
 * `creditsOverride: 0` para trabajo interno/automático que no se le cobra al cliente
 * (el costo real igual queda visible en /admin/consumption).
 */
export async function recordOriUsageForUser(input: {
  db: SupabaseClient;
  userId: string;
  eventType: UsageEventType;
  usage: GeminiUsage;
  model: string;
  creditsOverride?: number;
  channel?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  const orgId = await resolveOrgIdForUser(input.db, input.userId);
  if (!orgId) return;
  await recordUsageSafe({
    db: input.db,
    organizationId: orgId,
    userId: input.userId,
    eventType: input.eventType,
    channel: input.channel ?? null,
    provider: "google",
    model: input.model,
    gemini: input.usage,
    creditsOverride: input.creditsOverride,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    idempotencyKey: input.idempotencyKey ?? null
  });
}

/** Descuenta créditos de voz por minutos (mín. 1 min si hubo duración). Idempotente por callId. */
export async function chargeVoiceCall(input: {
  db: SupabaseClient;
  organizationId: string;
  userId: string;
  callId: string;
  durationSec: number;
  voiceAgentId?: string;
  channel?: string;
  voiceProvider?: VoiceBillingProvider;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const billedMinutes = voiceBillableMinutes(input.durationSec);
  if (billedMinutes <= 0) return;

  const provider = input.voiceProvider ?? "google";
  const eventType = provider === "elevenlabs" ? "voice_premium" : "voice";
  const credits = creditsForVoiceDuration(input.durationSec, provider);

  await recordUsageSafe({
    db: input.db,
    organizationId: input.organizationId,
    userId: input.userId,
    eventType,
    channel: input.channel ?? "voice",
    quantity: billedMinutes,
    creditsOverride: credits,
    provider: provider === "elevenlabs" ? "elevenlabs" : "telnyx",
    voiceMinutes: input.durationSec / 60,
    referenceType: "voice_agent_call",
    referenceId: input.callId,
    idempotencyKey: `voice_${input.callId}`,
    metadata: {
      duration_sec: input.durationSec,
      voice_agent_id: input.voiceAgentId,
      voice_provider: provider,
      ...(input.metadata ?? {}),
    },
  });
}

export type VoiceAttemptEventType = "voice_voicemail" | "voice_no_answer";

/** Cobro fijo por buzón o no contestada (campañas / salientes cortos). Idempotente por callId. */
export async function chargeVoiceAttempt(input: {
  db: SupabaseClient;
  organizationId: string;
  userId: string;
  callId: string;
  eventType: VoiceAttemptEventType;
  voiceAgentId?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  await ensurePricingConfig(input.db);
  const credits = creditsForEvent(input.eventType, 1);
  if (credits <= 0) return 0;

  const providerCostUsd =
    input.eventType === "voice_voicemail"
      ? (getVoiceUsdPerMinute("elevenlabs") > 0 ? 0.02 : 0.015)
      : 0.012;

  await recordUsageSafe({
    db: input.db,
    organizationId: input.organizationId,
    userId: input.userId,
    eventType: input.eventType,
    channel: input.channel ?? "voice",
    quantity: 1,
    creditsOverride: credits,
    provider: "telnyx",
    providerCostUsdOverride: providerCostUsd,
    referenceType: "voice_agent_call",
    referenceId: input.callId,
    idempotencyKey: `${input.eventType}_${input.callId}`,
    metadata: {
      voice_agent_id: input.voiceAgentId,
      ...(input.metadata ?? {}),
    },
  });

  await input.db.from("voice_agent_calls").update({ credits }).eq("id", input.callId);
  return credits;
}

export function billingBlockedMessage(reason: string): string {
  if (reason === "no_credits") {
    return "Te quedaste sin créditos este mes. Recarga o espera tu próxima fecha de facturación.";
  }
  return "Tu cuenta está suspendida. Regulariza el pago para continuar.";
}
