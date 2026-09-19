"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, Loader2, Unplug } from "lucide-react";
import { InfoBox } from "@/components/ui/InfoBox";
import { Switch } from "@/components/ui/Switch";
import { ConnectorIconTile } from "@/components/automations/ConnectorIconTile";
import { ConnectorModalPage } from "@/components/automations/ConnectorModalPage";
import { CopyButton } from "@/components/automations/workflow-nodes";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";
import { DEFAULT_WOOCOMMERCE_RULES, type WooCommerceRules } from "@/lib/woocommerce/rules";

interface WooCommerceConnection {
  id: string;
  siteUrl: string;
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
  updatedAt: string;
}

export default function WooCommerceConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<WooCommerceConnection | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [oriRules, setOriRules] = useState<WooCommerceRules>(DEFAULT_WOOCOMMERCE_RULES);
  const [savingOriRules, setSavingOriRules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [statusRes, oriRes] = await Promise.all([
        fetch("/api/conectores/woocommerce/status", { headers }),
        fetch("/api/conectores/woocommerce/ori-rules", { headers })
      ]);
      const statusData = await statusRes.json();
      if (statusRes.ok) {
        setConnection(statusData.connection ?? null);
        setWebhookSecret(statusData.webhookSecret ?? null);
      }
      const oriData = await oriRes.json();
      if (oriRes.ok) setOriRules(oriData.rules ?? DEFAULT_WOOCOMMERCE_RULES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConnect() {
    if (!siteUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/woocommerce/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          site_url: siteUrl.trim(),
          consumer_key: consumerKey.trim(),
          consumer_secret: consumerSecret.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo conectar con WooCommerce." });
        return;
      }
      setBanner({ kind: "success", text: "WooCommerce conectado correctamente." });
      setConsumerKey("");
      setConsumerSecret("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al conectar con WooCommerce." });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/conectores/woocommerce/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveOriRules(next: WooCommerceRules) {
    setOriRules(next);
    setSavingOriRules(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/conectores/woocommerce/ori-rules", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rules: next })
      });
    } finally {
      setSavingOriRules(false);
    }
  }

  const isActive = connection?.status === "active";

  return (
    <ConnectorModalPage icon={<ConnectorIconTile id="woocommerce" size="md" />} title="WooCommerce" loading={loading} banner={banner}>
      {isActive ? (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Conectado — {connection?.siteUrl}
        </p>
      ) : (
        <p className="text-xs text-gray-400 leading-relaxed">
          Conecta tu tienda para que tus agentes de IA consulten (y, si lo activas, actualicen) tu catálogo real de
          productos y pedidos en vivo — sin copiar tu catálogo a Noova.
        </p>
      )}
      {connection?.status === "error" && connection.lastError && (
        <p className="text-[11px] text-red-400/80 mt-2">Último error: {connection.lastError}</p>
      )}

      {isActive ? (
        <div className="mt-4 pt-4 border-t border-white/[.08] space-y-4">
          {webhookSecret && (
            <InfoBox icon={Info} layout="row" variant="neutral" className="p-4">
              <div className="space-y-1.5 min-w-0">
                <p className="font-medium text-gray-300">Secreto para webhooks en tiempo real:</p>
                <p className="text-[11px] leading-relaxed">
                  Úsalo al crear un webhook en WooCommerce → Ajustes → Avanzado → Webhooks (junto con la URL que te muestra
                  el nodo correspondiente en el editor de Automations), para que Noova pueda avisar a tus flujos en el
                  momento en que llega un pedido o cambia un producto.
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <code className="text-[11px] bg-black/30 px-2 py-1 rounded truncate">{webhookSecret}</code>
                  <CopyButton value={webhookSecret} />
                </div>
              </div>
            </InfoBox>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-300 mb-2">Permisos de Ori (copiloto interno)</p>
            <div className="space-y-2">
              <Switch
                label={<span className="text-xs text-gray-300">Activar WooCommerce para Ori</span>}
                checked={oriRules.enabled}
                disabled={savingOriRules}
                onChange={v => saveOriRules({ ...oriRules, enabled: v })}
              />
              <Switch
                label={<span className="text-xs text-gray-400">Consultar productos</span>}
                checked={oriRules.canReadProducts}
                disabled={savingOriRules || !oriRules.enabled}
                onChange={v => saveOriRules({ ...oriRules, canReadProducts: v })}
              />
              <Switch
                label={<span className="text-xs text-gray-400">Consultar pedidos</span>}
                checked={oriRules.canReadOrders}
                disabled={savingOriRules || !oriRules.enabled}
                onChange={v => saveOriRules({ ...oriRules, canReadOrders: v })}
              />
              <Switch
                label={<span className="text-xs text-gray-400">Actualizar productos</span>}
                checked={oriRules.canWriteProducts}
                disabled={savingOriRules || !oriRules.enabled}
                onChange={v => saveOriRules({ ...oriRules, canWriteProducts: v })}
              />
              <Switch
                label={<span className="text-xs text-gray-400">Actualizar pedidos</span>}
                checked={oriRules.canWriteOrders}
                disabled={savingOriRules || !oriRules.enabled}
                onChange={v => saveOriRules({ ...oriRules, canWriteOrders: v })}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
              Los permisos de cada agente de texto se configuran por agente en su propia página de configuración.
            </p>
          </div>

          <div className="pt-4 border-t border-white/[.08]">
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-white/[.08]">
          <InfoBox icon={Info} layout="row" variant="neutral" className="p-4 mb-4">
            <div className="space-y-1.5">
              <p className="font-medium text-gray-300">Cómo conseguir las credenciales:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>En tu WordPress: WooCommerce → Ajustes → Avanzado → API REST → Agregar clave.</li>
                <li>Permisos: Lectura, o Lectura/Escritura si vas a permitir que la IA actualice stock/precio/pedidos.</li>
                <li>Copia el Consumer Key y el Consumer Secret que WooCommerce genera y pégalos abajo.</li>
              </ol>
            </div>
          </InfoBox>
          <div className="space-y-2">
            <input
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              placeholder="https://tu-tienda.com"
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
            />
            <input
              type="password"
              value={consumerKey}
              onChange={e => setConsumerKey(e.target.value)}
              placeholder="Consumer Key (ck_...)"
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
            />
            <input
              type="password"
              value={consumerSecret}
              onChange={e => setConsumerSecret(e.target.value)}
              placeholder="Consumer Secret (cs_...)"
              className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || !siteUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()}
              className={`${btnPrimary} py-2 w-full`}
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
