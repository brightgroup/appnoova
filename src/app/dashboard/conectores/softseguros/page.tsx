"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Loader2, Unplug, User } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { InfoBox } from "@/components/ui/InfoBox";
import { SoftsegurosLogo } from "@/components/icons/brands/SoftsegurosLogo";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface SoftsegurosConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
}

export default function SoftsegurosConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<SoftsegurosConnection | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/softseguros/status", { headers });
      const data = await res.json();
      if (res.ok) setConnection(data.connection ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleConnect() {
    if (!username.trim() || !password.trim()) return;
    setConnecting(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      // Softseguros expone sus credenciales como username/password (inglés) — a diferencia de
      // La Equidad (usuario/contraseña). Cada página manda las llaves que su propia ruta espera,
      // sin un componente compartido de por medio que pueda confundirlas.
      const res = await fetch("/api/seguros/conectores/softseguros/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo conectar con Softseguros." });
        return;
      }
      setBanner({ kind: "success", text: "Softseguros conectado correctamente." });
      setUsername("");
      setPassword("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al conectar con Softseguros." });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/seguros/conectores/softseguros/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const isActive = connection?.status === "active";

  return (
    <ChannelListPage
      title="Softseguros"
      description="Conecta tu cuenta de Softseguros para traer tu cartera de pólizas a Noova — solo lectura, nunca escribimos nada de vuelta."
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
          <div className="w-12 h-12 rounded-xl bg-[#0a3d91]/15 flex items-center justify-center shrink-0">
            <SoftsegurosLogo className="w-8 h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white">Softseguros</h2>
            {isActive ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Sin conectar. La cartera de Pólizas solo se puede cargar a mano o por Excel todavía.
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
                Usuario y contraseña con los que entras a Softseguros. Noova los guarda cifrados
                (AES-256-GCM) y solo los usa para leer tu cartera — nunca crea ni modifica pólizas allá.
              </p>
            </InfoBox>
            <div className="space-y-2">
              <div className="relative">
                <User className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Usuario"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting || !username.trim() || !password.trim()}
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
