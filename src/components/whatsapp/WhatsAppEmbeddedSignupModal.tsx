"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { X, Loader2, MessageCircle, AlertCircle, Link2, ChevronRight } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { accentFocus, btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { MetaEmbeddedSignupPublicConfig } from "@/lib/meta/embedded-signup-config";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { TextAgentListItem } from "@/types/text-agent";

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

type WizardStep = "setup" | "connect";

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
  const [step, setStep] = useState<WizardStep>("setup");
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [friendlyName, setFriendlyName] = useState("");
  const [textAgentId, setTextAgentId] = useState("");
  const [fallbackPhoneE164, setFallbackPhoneE164] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingSession, setPendingSession] = useState<EmbeddedSignupSession | null>(null);
  const pendingSessionRef = useRef<EmbeddedSignupSession | null>(null);
  const authCodeRef = useRef<string | null>(null);
  const finalizeStartedRef = useRef(false);
  const fallbackPhoneRef = useRef("");
  const setupRef = useRef({ friendlyName: "", textAgentId: "" });

  useEffect(() => {
    fallbackPhoneRef.current = fallbackPhoneE164;
  }, [fallbackPhoneE164]);

  useEffect(() => {
    setupRef.current = { friendlyName, textAgentId };
  }, [friendlyName, textAgentId]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStatus("");
    setStep(reconnectChannel ? "connect" : "setup");
    setFriendlyName(reconnectChannel?.friendly_name ?? "");
    setTextAgentId("");
    setFallbackPhoneE164(reconnectChannel?.e164 ?? "");
    setPendingSession(null);
    pendingSessionRef.current = null;
    authCodeRef.current = null;
    finalizeStartedRef.current = false;

    void Promise.all([
      fetch("/api/whatsapp/embedded-signup/config").then(res => res.json()),
      getAuthHeaders()
        .then(headers => fetch("/api/text/agents", { headers }))
        .then(res => res.json())
        .catch(() => ({ agents: [] }))
    ]).then(([cfg, agentsData]) => {
      setConfig(cfg);
      setAgents(agentsData.agents ?? []);
    }).catch(() =>
      setConfig({ enabled: false, provider: "twilio", appId: null, configId: null, solutionId: null })
    );
  }, [open, reconnectChannel]);

  const completeSignup = useCallback(
    async (session: EmbeddedSignupSession, phoneE164?: string, authCode?: string) => {
      const code = authCode?.trim() || authCodeRef.current?.trim();
      if (!code) {
        setError("No se completó la verificación. Cierra el popup e inténtalo de nuevo.");
        setStatus("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setStatus("Configurando tu línea en Noova…");
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
            channel_id: reconnectChannel?.id,
            friendly_name: setupRef.current.friendlyName.trim() || reconnectChannel?.friendly_name || undefined,
            text_agent_id: setupRef.current.textAgentId || undefined,
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al conectar WhatsApp");

        if (data.result?.channelStatus === "active") {
          setStatus("¡WhatsApp conectado! Ya puedes recibir mensajes en Noova.");
        } else {
          setStatus("Línea registrada — activando mensajería (puede tardar 1–2 minutos)…");
        }
        onSuccess();
        setTimeout(() => onClose(), 1400);
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
    [onClose, onSuccess, reconnectChannel?.e164, reconnectChannel?.friendly_name, reconnectChannel?.id]
  );

  const tryFinalizeSignup = useCallback(
    (phoneE164?: string) => {
      if (finalizeStartedRef.current) return;

      const session = pendingSessionRef.current;
      const code = authCodeRef.current?.trim();
      if (!session?.wabaId || !code) return;

      if (needsManualPhone(session, Boolean(reconnectChannel?.e164)) && !phoneE164?.trim() && !fallbackPhoneRef.current.trim()) {
        setLoading(false);
        setStatus("Cuenta verificada — indica el número en formato +573001234567");
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
        setError("Conexión cancelada");
        return;
      }

      if (session.event === "ERROR") {
        setLoading(false);
        setStatus("");
        setError("No se pudo completar la verificación de WhatsApp");
        return;
      }

      if (session.event === "FINISH" || session.event === "FINISH_ONLY_WABA" || session.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || session.event === "FINISH_OBO_MIGRATION" || session.event === "FINISH_GRANT_ONLY_API_ACCESS") {
        pendingSessionRef.current = session;
        setPendingSession(session);
        setStatus(authCodeRef.current ? "Configurando tu línea en Noova…" : "Cuenta verificada — finalizando…");
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
      setError("Conexión automática no disponible — contacta a soporte Noova");
      return;
    }
    if (config.provider === "twilio" && !config.solutionId) {
      setError("WhatsApp aún no está habilitado en esta instancia — contacta a soporte");
      return;
    }
    if (!window.FB || !sdkReady) {
      setError("Preparando verificación… inténtalo de nuevo en unos segundos");
      return;
    }

    setError("");
    setStatus("Abriendo verificación de WhatsApp Business…");
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
          setStatus(pendingSessionRef.current ? "Configurando tu línea en Noova…" : "Verificación recibida — conectando…");
          tryFinalizeSignup();
          return;
        }

        if (pendingSessionRef.current) {
          setLoading(false);
          setError(
            "La cuenta se verificó pero faltó confirmar permisos. Cierra sesión de Facebook en el navegador e inténtalo de nuevo."
          );
          setStatus("");
          return;
        }

        if (response.status === "not_authorized" || !response.authResponse) {
          setLoading(false);
          setStatus("");
          setError("Conexión cancelada");
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
            {!reconnectChannel && step === "setup" && !showFallbackPhone && (
              <>
                <p className="text-sm text-gray-400">
                  Configura tu línea en Noova. La mensajería se activa automáticamente — no necesitas pagar nada aparte en Meta.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Nombre de la línea
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Ventas, Soporte…"
                    value={friendlyName}
                    onChange={e => setFriendlyName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Agente de texto (opcional)
                  </label>
                  <select
                    value={textAgentId}
                    onChange={e => setTextAgentId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus}`}
                  >
                    <option value="">Asignar después</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(step === "connect" || reconnectChannel) && !showFallbackPhone && (
              <p className="text-sm text-gray-400">
                {reconnectChannel ? (
                  <>
                    Reconecta{" "}
                    <span className="font-mono text-gray-200">{reconnectChannel.e164}</span>
                    {reconnectChannel.friendly_name ? ` (${reconnectChannel.friendly_name})` : ""}.
                  </>
                ) : (
                  <>
                    Verifica tu cuenta de WhatsApp Business. Solo confirma portfolio, cuenta y número — Noova configura el resto.
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
                  Indica el número que acabas de verificar para completar la conexión.
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
                    "Completar conexión"
                  )}
                </button>
              ) : step === "setup" && !reconnectChannel ? (
                <button
                  type="button"
                  disabled={!friendlyName.trim()}
                  onClick={() => setStep("connect")}
                  className={`${btnPrimary} w-full justify-center py-2.5 disabled:opacity-50`}
                >
                  Continuar <ChevronRight className="w-4 h-4" />
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
                    <><MessageCircle className="w-4 h-4" /> {reconnectChannel ? "Reconectar" : "Verificar WhatsApp Business"}</>
                  )}
                </button>
              )}

              {step === "connect" && !reconnectChannel && !showFallbackPhone && (
                <button
                  type="button"
                  onClick={() => setStep("setup")}
                  className={`${btnGhost} w-full justify-center py-2 text-sm`}
                >
                  Volver
                </button>
              )}

              <button type="button" onClick={onClose} className={`${btnGhost} w-full justify-center py-2`}>
                Cancelar
              </button>
            </div>

            {!config?.enabled && (
              <p className="text-xs text-amber-400/90 text-center">
                Conexión automática pendiente de configuración en el servidor.
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
