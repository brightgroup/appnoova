/**
 * Aislamiento de voz en telefonía Telnyx (Krisp / Quail) para agentes premium.
 * Limpia el audio inbound antes de que ElevenLabs transcriba — reduce voces de fondo.
 */

export type TelnyxNoiseSuppressionDirection = "inbound" | "outbound" | "both" | "disabled";

export type TelnyxNoiseSuppressionEngine =
  | "krisp_viva_tel_lite"
  | "krisp_viva_tel"
  | "quail_voice_focus"
  | "deep_filter_net"
  | "denoiser";

export interface TelnyxNoiseSuppressionConfig {
  direction: TelnyxNoiseSuppressionDirection;
  engine: TelnyxNoiseSuppressionEngine;
  attenuationLimit: number;
}

export interface TelnyxCredentialConnectionNoise {
  noise_suppression?: string | null;
  noise_suppression_details?: {
    engine?: string | null;
    attenuation_limit?: number | null;
  } | null;
}

const DEFAULT_CONFIG: TelnyxNoiseSuppressionConfig = {
  direction: "inbound",
  engine: "krisp_viva_tel_lite",
  attenuationLimit: 80,
};

/** Lee config desde env (defaults: Krisp Tel Lite, inbound, 80). */
export function resolveTelnyxNoiseSuppressionConfig(): TelnyxNoiseSuppressionConfig | null {
  const rawDirection = process.env.TELNYX_NOISE_SUPPRESSION?.trim().toLowerCase();
  if (rawDirection === "disabled" || rawDirection === "off" || rawDirection === "0") {
    return null;
  }

  const direction = (
    rawDirection === "outbound" || rawDirection === "both" || rawDirection === "inbound"
      ? rawDirection
      : DEFAULT_CONFIG.direction
  ) as TelnyxNoiseSuppressionDirection;

  const rawEngine = process.env.TELNYX_NOISE_SUPPRESSION_ENGINE?.trim().toLowerCase();
  const engine = (
    rawEngine === "krisp_viva_tel"
    || rawEngine === "quail_voice_focus"
    || rawEngine === "deep_filter_net"
    || rawEngine === "denoiser"
      ? rawEngine
      : DEFAULT_CONFIG.engine
  ) as TelnyxNoiseSuppressionEngine;

  const attenuationRaw = Number(process.env.TELNYX_NOISE_SUPPRESSION_ATTENUATION);
  const attenuationLimit = Number.isFinite(attenuationRaw)
    ? Math.min(100, Math.max(0, Math.round(attenuationRaw / 10) * 10))
    : DEFAULT_CONFIG.attenuationLimit;

  return { direction, engine, attenuationLimit };
}

export function telnyxNoiseSuppressionMatches(
  connection: TelnyxCredentialConnectionNoise,
  desired: TelnyxNoiseSuppressionConfig
): boolean {
  const details = connection.noise_suppression_details;
  return (
    connection.noise_suppression === desired.direction
    && details?.engine === desired.engine
    && Number(details?.attenuation_limit) === desired.attenuationLimit
  );
}

export function buildTelnyxNoiseSuppressionPatch(desired: TelnyxNoiseSuppressionConfig) {
  return {
    noise_suppression: desired.direction,
    noise_suppression_details: {
      engine: desired.engine,
      attenuation_limit: desired.attenuationLimit,
    },
  };
}
