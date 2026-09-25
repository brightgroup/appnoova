"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { X, Loader2, AlertCircle, Link2, Facebook } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { accentFocus, btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { MetaMessagingLoginPublicConfig } from "@/lib/meta-messaging/login-config";
import type { ConnectMetaMessagingResult } from "@/lib/meta-messaging/connect";
import type { TextAgentListItem } from "@/types/text-agent";

interface MetaMessagingConnectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const FB_SDK_VERSION = "v22.0";

function summarize(result: ConnectMetaMessagingResult): string {
  const messenger = result.connected.filter(c => c.platform === "messenger").length;
  const instagram = result.connected.filter(c => c.platform === "instagram").length;
  const parts: string[] = [];
  if (messenger) parts.push(`${messenger} ${messenger === 1 ? "página de Messenger" : "páginas de Messenger"}`);
  if (instagram) parts.push(`${instagram} ${instagram === 1 ? "cuenta de Instagram" : "cuentas de Instagram"}`);
  return `Conectado: ${parts.join(" y ")}.`;
}

export function MetaMessagingConnectModal({ open, onClose, onSuccess }: MetaMessagingConnectModalProps) {
  const [config, setConfig] = useState<MetaMessagingLoginPublicConfig | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [agents, setAgents] = useState<TextAgentListItem[] | null>(null);
  const [textAgentId, setTextAgentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConnectMetaMessagingResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setResult(null);
    setLoading(false);

    void Promise.all([
      fetch("/api/meta-messaging/config").then(res => res.json()),
      getAuthHeaders()
        .then(headers => fetch("/api/text/agents", { headers }))
        .then(res => res.json())
        .catch(() => ({ agents: [] }))
    ])
      .then(([cfg, agentsData]) => {
        setConfig(cfg);
        const list: TextAgentListItem[] = agentsData.agents ?? [];
        setAgents(list);
        setTextAgentId(prev => prev || (list.length === 1 ? list[0].id : ""));
      })
      .catch(() => setConfig({ enabled: false, appId: null, configId: null }));
  }, [open]);

  const initFacebookSdk = useCallback(() => {
    if (!config?.appId || !window.FB) return;
    window.FB.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: FB_SDK_VERSION });
    setSdkReady(true);
  }, [config?.appId]);

  useEffect(() => {
    if (sdkReady || !config?.appId) return;
    window.fbAsyncInit = initFacebookSdk;
    if (window.FB) initFacebookSdk();
  }, [config?.appId, initFacebookSdk, sdkReady]);

  const finish = useCallback(
    async (userAccessToken: string) => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/meta-messaging/connect", {
          method: "POST",
          headers,
          body: JSON.stringify({ user_access_token: userAccessToken, text_agent_id: textAgentId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo conectar");
        setResult(data.result);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, textAgentId]
  );

  const launchLogin = () => {
    if (!config?.configId || !window.FB || !sdkReady) {
      setError("Preparando la conexión con Meta… inténtalo de nuevo en unos segundos");
      return;
    }
    setError("");
    setLoading(true);

    window.FB.login(
      (response: unknown) => {
        // Token de usuario corto: el servidor lo valida con debug_token y lo
        // cambia por uno largo. (El flujo con `code` no sirve aquí: Meta exige
        // en el canje el mismo redirect_uri interno que usó el SDK.)
        const token = (response as { authResponse?: { accessToken?: string } }).authResponse?.accessToken?.trim();
        if (!token) {
          setLoading(false);
          setError("Conexión cancelada");
          return;
        }
        void finish(token);
      },
      { config_id: config.configId }
    );
  };

  if (!open) return null;

  const noAgents = agents !== null && agents.length === 0;
  const canConnect = Boolean(config?.enabled && sdkReady && textAgentId && !loading);

  return (
    <>
      {config?.enabled && config.appId && (
        <Script src="https://connect.facebook.net/es_LA/sdk.js" strategy="lazyOnload" onLoad={initFacebookSdk} />
      )}

      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-[#13141c] border border-white/[.08] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#99c9ff]" />
              <h2 className="text-lg font-bold text-white">Conectar Messenger e Instagram</h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {result ? (
              <>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">
                  {summarize(result)} Los mensajes nuevos llegarán a tu inbox.
                </div>
                {result.pagesWithoutInstagram.length > 0 && (
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {result.pagesWithoutInstagram.join(", ")}{" "}
                    {result.pagesWithoutInstagram.length === 1 ? "no tiene" : "no tienen"} un Instagram profesional
                    vinculado, así que solo quedó Messenger. Vincúlalo desde la app de Instagram (Configuración → Tipo
                    de cuenta → Empresa) y vuelve a conectar.
                  </p>
                )}
                {result.issues.map(issue => (
                  <div
                    key={issue.pageName}
                    className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs"
                  >
                    <strong>{issue.pageName}:</strong> {issue.message}
                  </div>
                ))}
                <button type="button" onClick={onClose} className={`${btnPrimary} w-full justify-center py-2.5`}>
                  Listo
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-300">
                  Inicia sesión con Facebook y elige las páginas que quieres atender desde Noova. Si una página tiene
                  Instagram profesional vinculado, sus mensajes directos también quedan conectados.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Agente que atenderá
                  </label>
                  {noAgents ? (
                    <p className="text-sm text-gray-300">
                      Primero crea un agente de texto.{" "}
                      <Link href="/dashboard/agentes-texto" className="text-[#99c9ff] hover:underline">
                        Ir a agentes
                      </Link>
                    </p>
                  ) : (
                    <select
                      value={textAgentId}
                      onChange={e => setTextAgentId(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg bg-white/[.04] border border-white/[.08] text-white text-sm ${accentFocus}`}
                    >
                      <option value="">Elige un agente…</option>
                      {(agents ?? []).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    Después puedes cambiar el agente de cada canal por separado.
                  </p>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  En Instagram, activa además <strong className="text-gray-200">Configuración → Mensajes y respuestas a
                  historias → Herramientas conectadas → Permitir acceso a los mensajes</strong>.
                </p>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!canConnect}
                    onClick={launchLogin}
                    className={`${btnPrimary} w-full justify-center py-2.5 disabled:opacity-50`}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Conectando…</>
                    ) : (
                      <><Facebook className="w-4 h-4" /> Continuar con Facebook</>
                    )}
                  </button>
                  <button type="button" onClick={onClose} className={`${btnGhost} w-full justify-center py-2`}>
                    Cancelar
                  </button>
                </div>

                {config && !config.enabled && (
                  <p className="text-xs text-amber-300 text-center">
                    Conexión con Meta pendiente de configuración en el servidor.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
