/** Configuración pública para Meta Embedded Signup. */

export type WhatsAppOnboardingProvider = "meta" | "twilio";

export interface MetaEmbeddedSignupPublicConfig {
  enabled: boolean;
  provider: WhatsAppOnboardingProvider;
  appId: string | null;
  configId: string | null;
  solutionId: string | null;
}

export function getWhatsAppOnboardingProvider(): WhatsAppOnboardingProvider {
  const raw = process.env.WHATSAPP_DEFAULT_PROVIDER?.trim().toLowerCase();
  return raw === "meta" ? "meta" : "twilio";
}

/** Embedded Signup siempre provisiona vía Twilio salvo override explícito meta. */
export function useTwilioWhatsAppProvisioning(): boolean {
  return getWhatsAppOnboardingProvider() !== "meta";
}

export function getMetaEmbeddedSignupPublicConfig(): MetaEmbeddedSignupPublicConfig {
  const provider = getWhatsAppOnboardingProvider();
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || process.env.META_APP_ID?.trim() || null;
  const configId =
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
    || process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
    || null;
  const solutionId =
    process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_SOLUTION_ID?.trim()
    || process.env.TWILIO_WHATSAPP_SOLUTION_ID?.trim()
    || null;

  const enabled =
    provider === "meta"
      ? Boolean(appId && configId)
      : Boolean(appId && configId && solutionId);

  return { enabled, provider, appId, configId, solutionId };
}

export function assertEmbeddedSignupConfigured(): MetaEmbeddedSignupPublicConfig & {
  enabled: true;
  appId: string;
  configId: string;
} {
  const cfg = getMetaEmbeddedSignupPublicConfig();
  if (!cfg.enabled || !cfg.appId || !cfg.configId) {
    throw new Error(
      cfg.provider === "meta"
        ? "Vinculación WhatsApp Meta no configurada — faltan META_APP_ID o META_EMBEDDED_SIGNUP_CONFIG_ID"
        : "Vinculación WhatsApp no configurada — faltan META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID o TWILIO_WHATSAPP_SOLUTION_ID"
    );
  }
  if (cfg.provider === "twilio" && !cfg.solutionId) {
    throw new Error("Falta TWILIO_WHATSAPP_SOLUTION_ID para vinculación vía Twilio");
  }
  return cfg as MetaEmbeddedSignupPublicConfig & { enabled: true; appId: string; configId: string };
}
