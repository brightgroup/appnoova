"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Loader2, Unplug, User } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { InfoBox } from "@/components/ui/InfoBox";
import { LaEquidadLogo } from "@/components/icons/brands/LaEquidadLogo";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface InsurerConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
}

export default function LaEquidadConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<InsurerConnection | null>(null);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/la-equidad/status", { headers });
      const data = await res.json();
      if (res.ok) setConnection(data.connection ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnect() {
    if (!usuario.trim() || !contrasena.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/la-equidad/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim(), contrasena: contrasena.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo conectar con La Equidad." });
        return;
      }
      setBanner({ kind: "success", text: "La Equidad conectada correctamente." });
      setUsuario("");
      setContrasena("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al conectar con La Equidad." });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/seguros/conectores/la-equidad/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const isActive = connection?.status === "active";

  return (
    <ChannelListPage
      title="La Equidad Seguros"
      description="Conecta tu usuario de agente en La Equidad para que el cotizador de autos consulte tarifas reales en tu nombre."
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
          <div className="w-12 h-12 rounded-xl bg-[#008C45]/15 flex items-center justify-center shrink-0">
            <LaEquidadLogo className="w-6 h-6 text-[#008C45]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white">La Equidad Seguros</h2>
            {isActive ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Sin conectar. El cotizador de autos no puede pedir precio real a La Equidad todavía.
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
                Usuario y contraseña de tu cuenta de agente en La Equidad. Noova los guarda cifrados
                (AES-256-GCM) y solo los usa para llamar su web service en tu nombre — nunca los vemos en texto plano.
              </p>
            </InfoBox>
            <div className="space-y-2">
              <div className="relative">
                <User className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="Usuario"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={contrasena}
                  onChange={e => setContrasena(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting || !usuario.trim() || !contrasena.trim()}
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
