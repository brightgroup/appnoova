import { getMetaAppId, getMetaAppSecret } from "@/lib/meta/graph-config";

/**
 * Configuración pública del botón "Conectar Messenger + Instagram"
 * (Facebook Login for Business, variación General con token de usuario).
 * Es una configuración distinta a la de Embedded Signup de WhatsApp.
 * Se lee en runtime (no NEXT_PUBLIC_*) para que un cambio de env no
 * obligue a recompilar.
 */
export interface MetaMessagingLoginPublicConfig {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
}

export function getMetaMessagingLoginConfig(): MetaMessagingLoginPublicConfig {
  const appId = getMetaAppId();
  const configId = process.env.META_MESSAGING_LOGIN_CONFIG_ID?.trim() || null;
  return {
    enabled: Boolean(appId && configId && getMetaAppSecret()),
    appId,
    configId
  };
}
