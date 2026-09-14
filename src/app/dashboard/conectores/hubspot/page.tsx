"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Loader2, Unplug } from "lucide-react";
import { InfoBox } from "@/components/ui/InfoBox";
import { ConnectorIconTile } from "@/components/automations/ConnectorIconTile";
import { ConnectorModalPage } from "@/components/automations/ConnectorModalPage";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface HubspotConnection {
  id: string;
  authMode: "private_app" | "oauth";
  portalId: string | null;
  hubDomain: string | null;
  status: "active" | "disconnected" | "error";
  lastError: string | null;
  updatedAt: string;
}

export default function HubspotConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<HubspotConnection | null>(null);
  const [token, setToken] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/hubspot/status", { headers });
      const data = await res.json();
      if (res.ok) setConnection(data.connection ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/hubspot/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo conectar con HubSpot." });
        return;
      }
      setBanner({ kind: "success", text: "HubSpot conectado correctamente." });
      setToken("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al conectar con HubSpot." });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/conectores/hubspot/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const isActive = connection?.status === "active";

  return (
    <ConnectorModalPage
      icon={<ConnectorIconTile id="hubspot" size="md" />}
      title="HubSpot"
      loading={loading}
      banner={banner}
    >
      {isActive ? (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {connection?.portalId ? `Conectado — portal ${connection.portalId}` : "Conectado"}
        </p>
      ) : (
        <p className="text-xs text-gray-400 leading-relaxed">
          Conecta tu portal para automatizar acciones sobre tus conversaciones — el primer flujo
          disponible es el saludo automático al primer mensaje de un contacto nuevo.
        </p>
      )}
      {connection?.status === "error" && connection.lastError && (
        <p className="text-[11px] text-red-400/80 mt-2">Último error: {connection.lastError}</p>
      )}

      {isActive ? (
        <div className="mt-4 pt-4 border-t border-white/[.08]">
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
          >
            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
            Desconectar
          </button>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-white/[.08]">
          <InfoBox icon={Info} layout="row" variant="neutral" className="p-4 mb-4">
            <div className="space-y-1.5">
              <p className="font-medium text-gray-300">Cómo conseguir el token:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>En tu portal de HubSpot: Configuración → Integraciones → Private Apps → Crear una private app.</li>
                <li>
                  Scopes necesarios: <code>crm.objects.contacts.read</code>, <code>crm.objects.contacts.write</code>,{" "}
                  <code>conversations.read</code>, <code>conversations.write</code>.
                </li>
                <li>Copia el token que HubSpot genera (empieza con &quot;pat-&quot;) y pégalo abajo.</li>
              </ol>
            </div>
          </InfoBox>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="pat-na1-..."
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting || !token.trim()}
              className={`${btnPrimary} py-2 shrink-0`}
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Conectar
            </button>
          </div>
        </div>
      )}
    </ConnectorModalPage>
  );
}
