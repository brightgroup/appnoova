/** Configuración pública para Meta Embedded Signup (Tech Provider + Twilio). */

export interface MetaEmbeddedSignupPublicConfig {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  solutionId: string | null;
}

export function getMetaEmbeddedSignupPublicConfig(): MetaEmbeddedSignupPublicConfig {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || process.env.META_APP_ID?.trim() || null;
  const configId =
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
    || process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
    || null;
  const solutionId =
    process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_SOLUTION_ID?.trim()
    || process.env.TWILIO_WHATSAPP_SOLUTION_ID?.trim()
    || null;

  const enabled = Boolean(appId && configId && solutionId);

  return { enabled, appId, configId, solutionId };
}

export function assertEmbeddedSignupConfigured(): MetaEmbeddedSignupPublicConfig & {
  enabled: true;
  appId: string;
  configId: string;
  solutionId: string;
} {
  const cfg = getMetaEmbeddedSignupPublicConfig();
  if (!cfg.enabled || !cfg.appId || !cfg.configId || !cfg.solutionId) {
    throw new Error(
      "Vinculación WhatsApp no configurada — faltan META_APP_ID, META_EMBEDDED_SIGNUP_CONFIG_ID o TWILIO_WHATSAPP_SOLUTION_ID"
    );
  }
  return cfg as MetaEmbeddedSignupPublicConfig & {
    enabled: true;
    appId: string;
    configId: string;
    solutionId: string;
  };
}
