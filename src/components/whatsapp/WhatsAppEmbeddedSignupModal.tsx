"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { X, Loader2, MessageCircle, AlertCircle, Link2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { accentFocus, btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { TextAgentListItem } from "@/types/text-agent";
import type { MetaEmbeddedSignupPublicConfig } from "@/lib/meta/embedded-signup-config";

interface WhatsAppEmbeddedSignupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
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
  if (!event.origin.endsWith("facebook.com")) return null;
  try {
    const data = JSON.parse(String(event.data)) as {
      type?: string;
      event?: string;
      data?: Record<string, string | undefined>;
    };
    if (data.type !== "WA_EMBEDDED_SIGNUP") return null;

    const payload = data.data ?? {};
    const wabaId = payload.waba_id?.trim();
    if (!wabaId) return null;

    const displayPhoneNumber =
      payload.display_phone_number?.trim()
      || payload.phone_number?.trim()
      || payload.current_phone_number?.trim()
      || undefined;

    return {
      wabaId,
      phoneNumberId: payload.phone_number_id?.trim() || undefined,
      displayPhoneNumber,
      event: data.event ?? "FINISH"
    };
  } catch {
    return null;
  }
}

export function WhatsAppEmbeddedSignupModal({
  open,
  onClose,
  onSuccess
}: WhatsAppEmbeddedSignupModalProps) {
  const [config, setConfig] = useState<MetaEmbeddedSignupPublicConfig | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<TextAgentListItem[]>([]);
  const [form, setForm] = useState({
    friendly_name: "",
    text_agent_id: "",
    phone_e164: ""
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingSession, setPendingSession] = useState<EmbeddedSignupSession | null>(null);
  const pendingSessionRef = useRef<EmbeddedSignupSession | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStatus("");
    setPendingSession(null);
    pendingSessionRef.current = null;

    fetch("/api/whatsapp/embedded-signup/config")
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => setConfig({ enabled: false, appId: null, configId: null, solutionId: null }));

    getAuthHeaders()
      .then(headers => fetch("/api/text/agents", { headers }))
      .then(res => res.json())
      .then(data => {
        if (data.agents) setAgents(data.agents);
      })
      .catch(console.error);
  }, [open]);

  const completeSignup = useCallback(
    async (session: EmbeddedSignupSession) => {
      setLoading(true);
      setStatus("Registrando número en Twilio…");
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
            phone_e164: form.phone_e164.trim() || undefined,
            text_agent_id: form.text_agent_id || undefined,
            friendly_name: form.friendly_name.trim() || undefined
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
      } finally {
        setLoading(false);
        pendingSessionRef.current = null;
        setPendingSession(null);
      }
    },
    [form.friendly_name, form.phone_e164, form.text_agent_id, onClose, onSuccess]
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

      if (session.event === "FINISH" || session.event === "FINISH_ONLY_WABA") {
        pendingSessionRef.current = session;
        setPendingSession(session);
        if (session.event === "FINISH_ONLY_WABA" && !session.displayPhoneNumber && !form.phone_e164.trim()) {
          setLoading(false);
          setStatus("WABA vinculada — indica el número E.164 y pulsa «Completar vinculación»");
          return;
        }
        void completeSignup(session);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, config?.enabled, completeSignup, form.phone_e164]);

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
    if (!config?.enabled || !config.configId || !config.solutionId) {
      setError("Vinculación automática no disponible — contacta a soporte");
      return;
    }
    if (!window.FB || !sdkReady) {
      setError("Cargando SDK de Meta… inténtalo de nuevo en unos segundos");
      return;
    }

    setError("");
    setStatus("Abriendo registro de Meta…");
    setLoading(true);

    window.FB.login(
      () => {
        // Twilio Tech Provider: el código OAuth no se usa; la sesión llega por postMessage.
      },
      {
        config_id: config.configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          setup: { solutionID: config.solutionId }
        }
      }
    );
  };

  const completePending = () => {
    const session = pendingSessionRef.current;
    if (!session) return;
    void completeSignup(session);
  };

  if (!open) return null;

  const canConnect = config?.enabled && sdkReady;

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
              <h2 className="text-lg font-bold text-white">Conectar WhatsApp</h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-400">
              Vincula tu cuenta de WhatsApp Business con Meta. El flujo es el mismo que usan plataformas
              como Dapta: eliges tu portfolio, WABA y número sin salir de Noova.
            </p>

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

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre de la línea</label>
              <input
                type="text"
                value={form.friendly_name}
                onChange={e => setForm(f => ({ ...f, friendly_name: e.target.value }))}
                placeholder="Ej. Ventas WhatsApp"
                className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus}`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Agente de texto (opcional)</label>
              <select
                value={form.text_agent_id}
                onChange={e => setForm(f => ({ ...f, text_agent_id: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus}`}
              >
                <option value="">Sin asignar aún</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Número E.164 (solo si Meta no lo envía)
              </label>
              <input
                type="text"
                value={form.phone_e164}
                onChange={e => setForm(f => ({ ...f, phone_e164: e.target.value }))}
                placeholder="+573001234567"
                className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm font-mono ${accentFocus}`}
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={loading || !canConnect}
                onClick={launchEmbeddedSignup}
                className={`${btnPrimary} w-full justify-center py-2.5 disabled:opacity-50`}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Conectando…</>
                ) : (
                  <><MessageCircle className="w-4 h-4" /> Continuar con Meta</>
                )}
              </button>

              {pendingSession && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={completePending}
                  className={`${btnGhost} w-full justify-center py-2`}
                >
                  Completar vinculación
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
