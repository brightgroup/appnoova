"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, Plus, Trash2, Loader2, RefreshCw } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import { btnPrimarySm, btnGhost, inputSearch, textMuted, textSecondary } from "@/lib/brand-ui";
import type { TestPhoneNumberRecord } from "@/types/test-phone-number";

interface TestPhoneNumbersPanelProps {
  compact?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  showSelector?: boolean;
}

export function TestPhoneNumbersPanel({
  compact = false,
  onSelect,
  selectedId,
  showSelector = false
}: TestPhoneNumbersPanelProps) {
  const [numbers, setNumbers] = useState<TestPhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);
  const [label, setLabel] = useState("Mi celular");
  const [e164, setE164] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/test-numbers", { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar números de prueba");
        return;
      }
      setNumbers(data.test_numbers ?? []);
      setDbReady(data.dbReady !== false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!e164.trim()) return;
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/test-numbers", {
        method: "POST",
        headers,
        body: JSON.stringify({ e164, label })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el número");
        return;
      }
      setE164("");
      setLabel("Mi celular");
      setShowForm(false);
      await load();
      if (data.test_number?.id) onSelect?.(data.test_number.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/test-numbers", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id })
      });
      if (res.ok) await load();
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? "py-6" : "py-16"} text-gray-400`}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {!dbReady && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
          Ejecuta la migración <code>010_test_phone_numbers.sql</code> en Supabase.
        </div>
      )}

      {showSelector && numbers.length > 0 && (
        <div>
          <label className={`block text-[11px] font-medium ${textMuted} mb-1.5 uppercase tracking-wide`}>
            Número desde el que llamarás
          </label>
          <select
            value={selectedId ?? ""}
            onChange={e => onSelect?.(e.target.value)}
            className="w-full bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
          >
            {numbers.map(n => (
              <option key={n.id} value={n.id}>{n.label} · {n.e164}</option>
            ))}
          </select>
        </div>
      )}

      {!compact && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Números de prueba</h2>
            <p className={`text-sm ${textMuted}`}>
              Teléfonos desde los que llamarás para probar tus agentes.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className={btnGhost} title="Actualizar">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowForm(v => !v)} className={btnPrimarySm}>
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>
      )}

      {(showForm || compact) && (
        <form onSubmit={handleCreate} className="rounded-xl border border-white/[.10] bg-noova-surface p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-[11px] font-medium ${textMuted} mb-1`}>Etiqueta</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Mi celular"
                className={inputSearch}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-medium ${textMuted} mb-1`}>Número E.164</label>
              <input
                value={e164}
                onChange={e => setE164(e.target.value)}
                placeholder="+573001234567"
                className={inputSearch}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className={btnPrimarySm}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Guardar número de prueba
          </button>
        </form>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
      )}

      {numbers.length === 0 ? (
        <div className={`rounded-xl border border-dashed border-white/[.12] text-center ${compact ? "p-5" : "p-10"}`}>
          <Phone className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className={`text-sm ${textSecondary}`}>Sin números de prueba</p>
          {!compact && (
            <p className={`text-xs ${textMuted} mt-1`}>Agrega el celular desde el que llamarás a tus agentes.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {numbers.map(n => (
            <li
              key={n.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                showSelector && selectedId === n.id
                  ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/[.06]"
                  : "border-white/[.10] bg-noova-surface"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{n.label}</p>
                <p className="text-xs font-mono text-gray-400">{n.e164}</p>
              </div>
              <button
                onClick={() => handleDelete(n.id)}
                disabled={deletingId === n.id}
                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                title="Eliminar"
              >
                {deletingId === n.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
