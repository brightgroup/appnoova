"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, RefreshCw, Search, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, btnIcon, inputSearch, registryTableHead, registryTableHeadRow,
  registryTableRow, textMuted, textSecondary
} from "@/lib/brand-ui";
import { formatDateTime, formatPhoneDisplay } from "@/lib/telephony/format-phone";
import { TestPhoneNumberModal } from "@/components/telephony/TestPhoneNumberModal";
import type { TestPhoneNumberRecord } from "@/types/test-phone-number";

const PAGE_SIZES = [10, 25, 50];

export function TestPhoneNumbersPanel() {
  const [numbers, setNumbers] = useState<TestPhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TestPhoneNumberRecord | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return numbers;
    return numbers.filter(n =>
      n.label.toLowerCase().includes(q) ||
      n.e164.includes(q) ||
      (n.created_by_name ?? "").toLowerCase().includes(q)
    );
  }, [numbers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize]);

  async function handleSave(data: { label: string; e164: string }) {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telephony/test-numbers", {
        method: editing ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(editing ? { id: editing.id, ...data } : data)
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "No se pudo guardar");
        return;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: TestPhoneNumberRecord) {
    setTogglingId(row.id);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/telephony/test-numbers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: row.id, active: !row.active })
      });
      await load();
    } finally {
      setTogglingId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: TestPhoneNumberRecord) {
    setEditing(row);
    setModalOpen(true);
  }

  return (
    <div className="flex flex-col min-h-0">
      <p className={`text-sm ${textSecondary} leading-relaxed mb-5 max-w-3xl`}>
        Los números de prueba están exentos de cargos. Puedes agregar un número para recibir
        llamadas de prueba de tus agentes sin costo adicional.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputSearch}
          />
        </div>
        <button onClick={load} className={btnIcon} title="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={openCreate} className={btnPrimary}>
          <Plus className="w-4 h-4" /> Nuevo número de prueba
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border border-white/[.10] bg-noova-surface">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">No hay números de prueba</div>
        ) : (
          <table className="w-full min-w-[900px] text-xs">
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className="px-5 py-3 text-left font-semibold">Número</th>
                <th className="px-4 py-3 text-left font-semibold">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Creado por</th>
                <th className="px-4 py-3 text-left font-semibold">Creado el</th>
                <th className="px-4 py-3 text-left font-semibold">Actualizado por</th>
                <th className="px-4 py-3 text-left font-semibold">Actualizado el</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr key={row.id} className={registryTableRow}>
                  <td className="px-5 py-3.5 font-mono text-sm text-white">
                    {formatPhoneDisplay(row.e164)}
                  </td>
                  <td className="px-4 py-3.5 text-gray-200">{row.label}</td>
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      disabled={togglingId === row.id}
                      onClick={() => toggleActive(row)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        row.active !== false ? "bg-[#5b5bf6]" : "bg-white/20"
                      }`}
                      aria-label={row.active !== false ? "Activo" : "Inactivo"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          row.active !== false ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                  </td>
                  <td className={`px-4 py-3.5 ${textMuted}`}>{row.created_by_name ?? "—"}</td>
                  <td className={`px-4 py-3.5 ${textMuted}`}>{formatDateTime(row.created_at)}</td>
                  <td className={`px-4 py-3.5 ${textMuted}`}>{row.updated_by_name ?? row.created_by_name ?? "—"}</td>
                  <td className={`px-4 py-3.5 ${textMuted}`}>{formatDateTime(row.updated_at)}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => openEdit(row)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-300 hover:text-white hover:bg-white/[.08]"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 mt-4 text-xs text-gray-400 shrink-0">
        <span>
          Mostrando {filtered.length === 0 ? 0 : (pageSafe - 1) * pageSize + 1} a{" "}
          {Math.min(pageSafe * pageSize, filtered.length)} de {filtered.length} entradas
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={pageSafe <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="p-1 rounded hover:bg-white/[.08] disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-6 h-6 rounded-full bg-white/[.10] text-white flex items-center justify-center text-[11px]">
            {pageSafe}
          </span>
          <button
            disabled={pageSafe >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="p-1 rounded hover:bg-white/[.08] disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="ml-2 bg-noova-surface border border-white/[.12] rounded px-2 py-1 text-white"
          >
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <TestPhoneNumberModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
        saving={saving}
      />
    </div>
  );
}
