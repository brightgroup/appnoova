"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Unplug } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface InsurerConnection {
  status: "pending" | "active" | "disconnected" | "error";
  lastError: string | null;
}

/**
 * Fila de conector de Verifik — opcional. Si el corredor ya tiene su propia
 * cuenta de Verifik (para otros usos suyos), la conecta acá y el cotizador
 * de autos la usa en vez de la cuenta compartida de Noova (que cobra un
 * margen por consulta). Un solo campo (token JWT), a diferencia de
 * InsurerConnectorRow (usuario/contraseña) que usan La Equidad/Softseguros.
 */
export function VerifikConnectorRow() {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<InsurerConnection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/verifik/status", { headers });
      const data = await res.json();
      if (!cancelled && res.ok) setConnection(data.connection ?? null);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = connection?.status === "active";

  async function handleConnect() {
    if (!token.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/conectores/verifik/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo conectar con Verifik.");
        return;
      }
      setConnection({ status: "active", lastError: null });
      setShowForm(false);
      setToken("");
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
      await fetch("/api/seguros/conectores/verifik/disconnect", { method: "POST", headers });
      setConnection({ status: "disconnected", lastError: null });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#2463eb]/15 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-[#6f95f2]">VK</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Verifik (tu propia cuenta)</p>
          {loading ? (
            <p className="text-[11px] text-gray-500">Cargando…</p>
          ) : isActive ? (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Conectado
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">Opcional — sin conectar usa la cuenta de Noova</p>
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
            Si ya usas Verifik por tu cuenta (fuera de Noova), pega acá el token de tu panel
            (Settings → API Key) para que el cotizador de autos use tu cuenta en vez de la de Noova —
            sin este conector, cada consulta corre por la cuenta compartida de Noova con un pequeño margen.
          </p>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="relative">
            <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token de Verifik (JWT)"
              className={`${modalInput} !pl-8`}
            />
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={submitting || !token.trim()}
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
