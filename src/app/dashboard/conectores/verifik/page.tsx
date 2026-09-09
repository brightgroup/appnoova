"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Loader2, Unplug } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { InfoBox } from "@/components/ui/InfoBox";
import { VerifikLogo } from "@/components/icons/brands/VerifikLogo";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface InsurerConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
}

export default function VerifikConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<InsurerConnection | null>(null);
  const [token, setToken] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/verifik/status", { headers });
      const data = await res.json();
      if (res.ok) setConnection(data.connection ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnect() {
    if (!token.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/verifik/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo conectar con Verifik." });
        return;
      }
      setBanner({ kind: "success", text: "Verifik conectado correctamente." });
      setToken("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al conectar con Verifik." });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/seguros/conectores/verifik/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const isActive = connection?.status === "active";

  return (
    <ChannelListPage
      title="Verifik"
      description="Opcional: conecta tu propia cuenta de Verifik para consultar placas — si no la conectas, el cotizador de autos usa la cuenta compartida de Noova (con un pequeño margen por consulta)."
      loading={loading}
    >
      {banner && (
        <div
          className={`mb-4 p-3 rounded-xl text-xs border ${
            banner.kind === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#3b4ae0]/15 flex items-center justify-center shrink-0">
            <VerifikLogo className="w-8 h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white">Verifik</h2>
            {isActive ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado con tu propia cuenta
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Sin conectar — usando la cuenta compartida de Noova. Es opcional, no bloquea el cotizador.
              </p>
            )}
            {connection?.status === "error" && connection.lastError && (
              <p className="text-[11px] text-red-400/80 mt-2">Último error: {connection.lastError}</p>
            )}
          </div>
        </div>

        {isActive ? (
          <div className="mt-5 pt-5 border-t border-white/[.08]">
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
          <div className="mt-5 pt-5 border-t border-white/[.08]">
            <InfoBox icon={Info} layout="row" variant="neutral" className="p-4 mb-4">
              <p className="text-[11px] leading-relaxed">
                Si ya usas Verifik por tu cuenta (fuera de Noova), pega acá el token de tu panel
                (Settings → API Key) para que el cotizador de autos consulte placas con tu propia cuenta
                en vez de la de Noova.
              </p>
            </InfoBox>
            <div className="space-y-2">
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Token de Verifik (JWT)"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting || !token.trim()}
                className={`${btnPrimary} py-2 w-full justify-center`}
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar conexión
              </button>
            </div>
          </div>
        )}
      </div>
    </ChannelListPage>
  );
}
