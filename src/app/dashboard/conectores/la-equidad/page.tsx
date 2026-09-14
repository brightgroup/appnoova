"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Loader2, Unplug, User, X } from "lucide-react";
import { InfoBox } from "@/components/ui/InfoBox";
import { ConnectorIconTile } from "@/components/automations/ConnectorIconTile";
import { ConnectorModalPage } from "@/components/automations/ConnectorModalPage";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface InsurerConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
  ramos: string[];
}

interface RamoOption {
  id: string;
  nombre: string;
  slug: string;
}

export default function LaEquidadConectorPage() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<InsurerConnection | null>(null);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [ramoQuery, setRamoQuery] = useState("");
  const [ramoResults, setRamoResults] = useState<RamoOption[]>([]);
  const [savingRamos, setSavingRamos] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/ramos?q=${encodeURIComponent(ramoQuery)}`, { headers });
      const data = await res.json().catch(() => null);
      if (!cancelled && res.ok) setRamoResults(data.ramos ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [ramoQuery]);

  async function saveRamos(nextRamos: string[]) {
    setSavingRamos(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/la-equidad/ramos", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ramos: nextRamos })
      });
      const data = await res.json();
      if (res.ok) setConnection(data.connection ?? null);
    } finally {
      setSavingRamos(false);
    }
  }

  function addRamo(slug: string) {
    if (!connection || connection.ramos.includes(slug)) return;
    void saveRamos([...connection.ramos, slug]);
    setRamoQuery("");
  }

  function removeRamo(slug: string) {
    if (!connection) return;
    void saveRamos(connection.ramos.filter(r => r !== slug));
  }

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
    <ConnectorModalPage
      icon={<ConnectorIconTile id="la-equidad" size="md" />}
      title="La Equidad Seguros"
      loading={loading}
      banner={banner}
    >
      {isActive ? (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
        </p>
      ) : (
        <p className="text-xs text-gray-400 leading-relaxed">
          Conecta tu usuario de agente para que el cotizador de autos consulte tarifas reales en tu nombre.
        </p>
      )}
      {connection?.status === "error" && connection.lastError && (
        <p className="text-[11px] text-red-400/80 mt-2">Último error: {connection.lastError}</p>
      )}

      {isActive ? (
        <div className="mt-4 pt-4 border-t border-white/[.08] space-y-3">
          <div>
            <p className="text-xs font-medium text-white mb-1">¿Qué ramos cotiza esta aseguradora?</p>
            <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
              Solo autos tiene cotización automática por ahora — marcar otros ramos aquí deja todo listo
              para cuando Noova sume el conector correspondiente.
            </p>
            {connection.ramos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {connection.ramos.map(slug => {
                  const nombre = ramoResults.find(r => r.slug === slug)?.nombre ?? slug;
                  return (
                    <span
                      key={slug}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] bg-[#0f7eff]/15 text-[#99c9ff] border border-[#0f7eff]/20"
                    >
                      {nombre}
                      <button
                        type="button"
                        onClick={() => removeRamo(slug)}
                        disabled={savingRamos}
                        className="hover:bg-[#0f7eff]/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={ramoQuery}
                onChange={e => setRamoQuery(e.target.value)}
                placeholder="Buscar ramo (ej. Vida, Hogar, Cumplimiento)…"
                className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
              />
              {ramoQuery.trim() && (
                <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-white/[.10] bg-noova-surface shadow-xl">
                  {ramoResults.filter(r => !connection.ramos.includes(r.slug)).length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-gray-500">Sin resultados.</p>
                  ) : (
                    ramoResults
                      .filter(r => !connection.ramos.includes(r.slug))
                      .map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => addRamo(r.slug)}
                          className="block w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-white/[.06]"
                        >
                          {r.nombre}
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>

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
    </ConnectorModalPage>
  );
}
