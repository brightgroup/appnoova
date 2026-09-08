"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Unplug, User } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface InsurerConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
}

/**
 * Fila de conector con usuario/contraseña — usada para las aseguradoras
 * dentro del grupo "Aseguradoras" (La Equidad) y para Softseguros como
 * tarjeta plana aparte (no es una aseguradora, es el sistema de registro del
 * corredor, pero comparte el mismo mecanismo de conexión y las mismas rutas
 * `/api/seguros/conectores/{provider}/...`).
 */
export function InsurerConnectorRow({
  providerKey,
  letters,
  name
}: {
  providerKey: "la_equidad" | "softseguros";
  letters: string;
  name: string;
}) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<InsurerConnection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/conectores/${providerKey.replace(/_/g, "-")}/status`, { headers });
      const data = await res.json();
      if (!cancelled && res.ok) setConnection(data.connection ?? null);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerKey]);

  const isActive = connection?.status === "active";

  async function handleConnect() {
    if (!usuario.trim() || !contrasena.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/conectores/${providerKey.replace(/_/g, "-")}/connect`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim(), contrasena: contrasena.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `No se pudo conectar con ${name}.`);
        return;
      }
      setConnection({ status: "active", lastError: null });
      setShowForm(false);
      setUsuario("");
      setContrasena("");
    } catch {
      setError("Error de red al conectar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/seguros/conectores/${providerKey.replace(/_/g, "-")}/disconnect`, {
        method: "POST",
        headers
      });
      setConnection({ status: "disconnected", lastError: null });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#2463eb]/15 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-[#6f95f2]">{letters}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{name}</p>
          {loading ? (
            <p className="text-[11px] text-gray-500">Cargando…</p>
          ) : isActive ? (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Conectado
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">Sin conectar</p>
          )}
        </div>
        {!loading && (
          isActive ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={submitting}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className={`${btnGhost} !px-2.5 !py-1.5 !text-xs shrink-0`}
            >
              Conectar
            </button>
          )
        )}
      </div>

      {showForm && !isActive && (
        <div className="mt-3 pl-11 space-y-2">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Usuario y contraseña de tu cuenta de agente en {name}. Noova los guarda cifrados y solo los usa para
            llamar el web service en tu nombre.
          </p>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="relative">
            <User className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Usuario"
              className={`${modalInput} !pl-8`}
            />
          </div>
          <div className="relative">
            <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Contraseña"
              className={`${modalInput} !pl-8`}
            />
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={submitting || !usuario.trim() || !contrasena.trim()}
            className={`${btnPrimary} !text-xs !py-1.5 gap-1.5`}
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Guardar conexión
          </button>
        </div>
      )}
    </div>
  );
}
