"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import {
  btnPrimary, registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableCellRight, registryTableLoading, registryTableEmpty
} from "@/lib/brand-ui";
import { formatDateTime, formatPhoneDisplay } from "@/lib/telephony/format-phone";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
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

  return (
    <>
      <RegistryTableLayout
        description="Los números de prueba están exentos de cargos. Puedes agregar un número para recibir llamadas de prueba de tus agentes sin costo adicional."
        search={search}
        onSearchChange={setSearch}
        onRefresh={load}
        refreshing={loading}
        error={error || undefined}
        action={
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Nuevo número de prueba
          </button>
        }
        footer={filtered.length > 0 ? (
          <>
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
          </>
        ) : undefined}
      >
        {loading ? (
          <div className={registryTableLoading}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : pageRows.length === 0 ? (
          <div className={registryTableEmpty}>No hay números de prueba</div>
        ) : (
          <table className={`${registryTable} min-w-[900px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Número</th>
                <th className={registryTableHeadCell}>Nombre</th>
                <th className={registryTableHeadCell}>Estado</th>
                <th className={registryTableHeadCell}>Creado por</th>
                <th className={registryTableHeadCell}>Creado el</th>
                <th className={registryTableHeadCell}>Actualizado por</th>
                <th className={registryTableHeadCell}>Actualizado el</th>
                <th className={`${registryTableHeadCell} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr key={row.id} className={registryTableRow}>
                  <td className={`${registryTableCellFirst} font-mono text-sm text-white`}>
                    {formatPhoneDisplay(row.e164)}
                  </td>
                  <td className={`${registryTableCell} text-gray-200`}>{row.label}</td>
                  <td className={registryTableCell}>
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
                  <td className={registryTableCellMuted}>{row.created_by_name ?? "—"}</td>
                  <td className={registryTableCellMuted}>{formatDateTime(row.created_at)}</td>
                  <td className={registryTableCellMuted}>{row.updated_by_name ?? row.created_by_name ?? "—"}</td>
                  <td className={registryTableCellMuted}>{formatDateTime(row.updated_at)}</td>
                  <td className={registryTableCellRight}>
                    <button
                      onClick={() => { setEditing(row); setModalOpen(true); }}
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
      </RegistryTableLayout>

      <TestPhoneNumberModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
        saving={saving}
      />
    </>
  );
}
