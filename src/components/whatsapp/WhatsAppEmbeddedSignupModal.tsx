"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { X, Loader2, MessageCircle, AlertCircle, Link2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { accentFocus, btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { MetaEmbeddedSignupPublicConfig } from "@/lib/meta/embedded-signup-config";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

interface WhatsAppEmbeddedSignupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Reconecta la misma fila (mismo id, agente y nombre). */
  reconnectChannel?: Pick<WhatsAppChannelRecord, "id" | "e164" | "friendly_name" | "provider"> | null;
}

interface EmbeddedSignupSession {
  wabaId: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  event: string;
}

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (cb: (response: unknown) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_VERSION = "v22.0";

function parseEmbeddedSignupMessage(event: MessageEvent): EmbeddedSignupSession | null {
  const origin = event.origin;
  if (
    !origin.endsWith("facebook.com")
    && origin !== "https://www.facebook.com"
    && origin !== "https://web.facebook.com"
  ) {
    return null;
  }
  try {
    const data = JSON.parse(String(event.data)) as {
      type?: string;
      event?: string;
      data?: Record<string, string | undefined>;
    };
    if (data.type !== "WA_EMBEDDED_SIGNUP") return null;

    const eventName = data.event ?? "";
    const finishEvents = new Set([
      "FINISH",
      "FINISH_ONLY_WABA",
      "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      "FINISH_OBO_MIGRATION",
      "FINISH_GRANT_ONLY_API_ACCESS"
    ]);
    if (!finishEvents.has(eventName) && eventName !== "CANCEL" && eventName !== "ERROR") {
      return null;
    }

    const payload = data.data ?? {};
    const wabaId = payload.waba_id?.trim();
    if (!wabaId && eventName !== "CANCEL" && eventName !== "ERROR") return null;

    const displayPhoneNumber =
      payload.display_phone_number?.trim()
      || payload.phone_number?.trim()
      || payload.current_phone_number?.trim()
      || undefined;

    return {
      wabaId: wabaId || "",
      phoneNumberId: payload.phone_number_id?.trim() || undefined,
      displayPhoneNumber,
      event: eventName
    };
  } catch {
    return null;
  }
}

function needsManualPhone(session: EmbeddedSignupSession, hasKnownPhone: boolean): boolean {
  if (hasKnownPhone) return false;
  return !session.phoneNumberId && !session.displayPhoneNumber;
}

export function WhatsAppEmbeddedSignupModal({
  open,
  onClose,
  onSuccess,
  reconnectChannel = null
}: WhatsAppEmbeddedSignupModalProps) {
  const [config, setConfig] = useState<MetaEmbeddedSignupPublicConfig | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fallbackPhoneE164, setFallbackPhoneE164] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingSession, setPendingSession] = useState<EmbeddedSignupSession | null>(null);
  const pendingSessionRef = useRef<EmbeddedSignupSession | null>(null);
  const authCodeRef = useRef<string | null>(null);
  const finalizeStartedRef = useRef(false);
  const fallbackPhoneRef = useRef("");

  useEffect(() => {
    fallbackPhoneRef.current = fallbackPhoneE164;
  }, [fallbackPhoneE164]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStatus("");
    setFallbackPhoneE164(reconnectChannel?.e164 ?? "");
    setPendingSession(null);
    pendingSessionRef.current = null;
    authCodeRef.current = null;
    finalizeStartedRef.current = false;

    fetch("/api/whatsapp/embedded-signup/config")
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() =>
        setConfig({ enabled: false, provider: "twilio", appId: null, configId: null, solutionId: null })
      );
  }, [open]);

  const completeSignup = useCallback(
    async (session: EmbeddedSignupSession, phoneE164?: string, authCode?: string) => {
      const code = authCode?.trim() || authCodeRef.current?.trim();
      if (!code) {
        setError("No se recibió el código de autorización de Meta. Cierra el popup e inténtalo de nuevo.");
        setStatus("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setStatus("Vinculando WhatsApp…");
      setError("");

      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/whatsapp/embedded-signup/complete", {
          method: "POST",
          headers,
          body: JSON.stringify({
            waba_id: session.wabaId,
            phone_number_id: session.phoneNumberId,
            display_phone_number: session.displayPhoneNumber,
            phone_e164: phoneE164?.trim() || reconnectChannel?.e164 || undefined,
            auth_code: code,
            channel_id: reconnectChannel?.id
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al vincular WhatsApp");

        setStatus(
          data.result?.channelStatus === "active"
            ? "WhatsApp conectado correctamente"
            : "Vinculación iniciada — el número puede tardar unos minutos en activarse"
        );
        onSuccess();
        setTimeout(() => onClose(), 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
        setStatus("");
        finalizeStartedRef.current = false;
      } finally {
        setLoading(false);
        pendingSessionRef.current = null;
        setPendingSession(null);
      }
    },
    [onClose, onSuccess, reconnectChannel?.id]
  );

  const tryFinalizeSignup = useCallback(
    (phoneE164?: string) => {
      if (finalizeStartedRef.current) return;

      const session = pendingSessionRef.current;
      const code = authCodeRef.current?.trim();
      if (!session?.wabaId || !code) return;

      if (needsManualPhone(session, Boolean(reconnectChannel?.e164)) && !phoneE164?.trim() && !fallbackPhoneRef.current.trim()) {
        setLoading(false);
        setStatus("WABA vinculada — indica el número en formato +573001234567");
        return;
      }

      finalizeStartedRef.current = true;
      void completeSignup(session, phoneE164 ?? fallbackPhoneRef.current, code);
    },
    [completeSignup, reconnectChannel?.e164]
  );

  useEffect(() => {
    if (!open || !config?.enabled) return;

    const onMessage = (event: MessageEvent) => {
      const session = parseEmbeddedSignupMessage(event);
      if (!session) return;

      if (session.event === "CANCEL") {
        setLoading(false);
        setStatus("");
        setError("Registro cancelado en Meta");
        return;
      }

      if (session.event === "ERROR") {
        setLoading(false);
        setStatus("");
        setError("Error durante el registro en Meta");
        return;
      }

      if (session.event === "FINISH" || session.event === "FINISH_ONLY_WABA" || session.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || session.event === "FINISH_OBO_MIGRATION" || session.event === "FINISH_GRANT_ONLY_API_ACCESS") {
        pendingSessionRef.current = session;
        setPendingSession(session);
        setStatus(authCodeRef.current ? "Vinculando WhatsApp…" : "Cuenta vinculada en Meta — confirmando…");
        tryFinalizeSignup();
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, config?.enabled, tryFinalizeSignup]);

  const initFacebookSdk = useCallback(() => {
    if (!config?.appId || !window.FB) return;
    window.FB.init({
      appId: config.appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: FB_SDK_VERSION
    });
    setSdkReady(true);
  }, [config?.appId]);

  useEffect(() => {
    if (sdkReady || !config?.appId) return;
    window.fbAsyncInit = initFacebookSdk;
    if (window.FB) initFacebookSdk();
  }, [config?.appId, initFacebookSdk, sdkReady]);

  const launchEmbeddedSignup = () => {
    if (!config?.appId || !config.configId) {
      setError("Vinculación automática no configurada — contacta a soporte");
      return;
    }
    if (config.provider === "twilio" && !config.solutionId) {
      setError("Falta TWILIO_WHATSAPP_SOLUTION_ID — esperando respuesta de Twilio");
      return;
    }
    if (!window.FB || !sdkReady) {
      setError("Cargando SDK de Meta… inténtalo de nuevo en unos segundos");
      return;
    }

    setError("");
    setStatus("Abriendo registro de Meta…");
    setLoading(true);
    setPendingSession(null);
    pendingSessionRef.current = null;
    authCodeRef.current = null;
    finalizeStartedRef.current = false;

    window.FB.login(
      (response: { authResponse?: { code?: string }; status?: string }) => {
        const code = response.authResponse?.code?.trim();
        if (code) {
          authCodeRef.current = code;
          setStatus(pendingSessionRef.current ? "Vinculando WhatsApp…" : "Código recibido — esperando datos de la cuenta…");
          tryFinalizeSignup();
          return;
        }

        if (pendingSessionRef.current) {
          setLoading(false);
          setError(
            "Meta vinculó la cuenta pero no devolvió el código OAuth. Cierra sesión de Facebook en el navegador e inténtalo de nuevo."
          );
          setStatus("");
          return;
        }

        if (response.status === "not_authorized" || !response.authResponse) {
          setLoading(false);
          setStatus("");
          setError("Registro cancelado en Meta");
        }
      },
      {
        config_id: config.configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          ...(config.provider === "twilio" && config.solutionId
            ? { setup: { solutionID: config.solutionId } }
            : { setup: {} })
        }
      }
    );
  };

  const completePending = () => {
    const session = pendingSessionRef.current;
    if (!session) return;
    if (needsManualPhone(session, Boolean(reconnectChannel?.e164)) && !fallbackPhoneE164.trim()) {
      setError("Indica el número en formato internacional, por ejemplo +573001234567");
      return;
    }
    void completeSignup(session, fallbackPhoneE164, authCodeRef.current ?? undefined);
  };

  if (!open) return null;

  const canConnect = Boolean(config?.enabled && sdkReady);
  const showFallbackPhone = pendingSession != null && needsManualPhone(pendingSession, Boolean(reconnectChannel?.e164));

  return (
    <>
      {config?.enabled && config.appId && (
        <Script
          src="https://connect.facebook.net/es_LA/sdk.js"
          strategy="lazyOnload"
          onLoad={initFacebookSdk}
        />
      )}

      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-[#13141c] border border-white/[.08] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">
                {reconnectChannel ? "Reconectar WhatsApp" : "Conectar WhatsApp"}
              </h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {!showFallbackPhone && (
              <p className="text-sm text-gray-400">
                {reconnectChannel ? (
                  <>
                    Vas a reconectar{" "}
                    <span className="font-mono text-gray-200">{reconnectChannel.e164}</span>
                    {reconnectChannel.friendly_name ? ` (${reconnectChannel.friendly_name})` : ""}.
                    Se conservan el agente y el nombre de la línea.
                  </>
                ) : (
                  <>
                    Vincula tu cuenta de WhatsApp Business: portfolio, cuenta y número en un solo flujo.
                  </>
                )}
              </p>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {status && !error && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                {status}
              </div>
            )}

            {showFallbackPhone && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Número de WhatsApp
                </label>
                <input
                  type="text"
                  value={fallbackPhoneE164}
                  onChange={e => setFallbackPhoneE164(e.target.value)}
                  placeholder="+573001234567"
                  autoFocus
                  className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm font-mono ${accentFocus}`}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Meta vinculó la cuenta pero no envió el número. Indícalo aquí para completar.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {showFallbackPhone ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={completePending}
                  className={`${btnPrimary} w-full justify-center py-2.5 disabled:opacity-50`}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Completando…</>
                  ) : (
                    "Completar vinculación"
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading || !canConnect}
                  onClick={launchEmbeddedSignup}
                  className={`${btnPrimary} w-full justify-center py-2.5 disabled:opacity-50`}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Conectando…</>
                  ) : (
                    <><MessageCircle className="w-4 h-4" /> {reconnectChannel ? "Reconectar" : "Continuar"}</>
                  )}
                </button>
              )}

              <button type="button" onClick={onClose} className={`${btnGhost} w-full justify-center py-2`}>
                Cancelar
              </button>
            </div>

            {!config?.enabled && (
              <p className="text-xs text-amber-400/90 text-center">
                Vinculación automática pendiente de configuración en el servidor.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Indica si el tenant puede usar Embedded Signup (config en servidor). */
export function useWhatsAppEmbeddedSignupEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/whatsapp/embedded-signup/config")
      .then(res => res.json())
      .then(data => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  return enabled;
}
