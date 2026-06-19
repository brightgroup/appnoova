"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Plus, Upload, MoreHorizontal, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { DataTableImportDialog } from "@/components/data-tables/DataTableImportDialog";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import {
  btnPrimary,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty,
} from "@/lib/brand-ui";
import type { DataTableRecord } from "@/types/data-table";

export default function TablasPage() {
  const router = useRouter();
  const [tables, setTables] = useState<DataTableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/data-tables");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setTables(json.tables ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = tables.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
  });

  const deleteTable = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la tabla «${name}»? Se desvinculará de los agentes. Esta acción no se puede deshacer.`)) return;
    setDeletingId(id);
    setOpenMenuId(null);
    const res = await authFetch(`/api/data-tables/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Error al eliminar");
      return;
    }
    setTables(prev => prev.filter(t => t.id !== id));
  };

  return (
    <>
      <ChannelListPage
        title="Tablas"
        description="Catálogos y fuentes de datos para tus agentes. Sube un Excel, edítalo aquí y asígnalo a un agente."
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar tabla…"
        onRefresh={load}
        refreshing={loading}
        error={error || undefined}
        action={
          <button type="button" onClick={() => setImportOpen(true)} className={`${btnPrimary} gap-2`}>
            <Upload className="w-4 h-4" />
            Subir Excel
          </button>
        }
      >
        {filtered.length === 0 ? (
          <div className={`${registryTableEmpty} flex flex-col items-center gap-3 py-16`}>
            <Database className="w-10 h-10 text-gray-600" />
            <p className="text-gray-400">
              {search.trim() ? "No hay tablas con ese nombre." : "Aún no tienes tablas de datos."}
            </p>
            {!search.trim() && (
              <button type="button" onClick={() => setImportOpen(true)} className={`${btnPrimary} gap-2`}>
                <Plus className="w-4 h-4" /> Subir tu primer Excel
              </button>
            )}
          </div>
        ) : (
          <table className={`${registryTable} min-w-[720px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Nombre</th>
                <th className={registryTableHeadCell}>Filas</th>
                <th className={registryTableHeadCell}>Columnas</th>
                <th className={registryTableHeadCell}>Actualizado</th>
                <th className={`${registryTableHeadCell} w-12`} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr
                  key={t.id}
                  className={registryTableRowClickable}
                  onClick={() => router.push(`/dashboard/tablas/${t.id}`)}
                >
                  <td className={registryTableCellFirst}>
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-[#a5a5ff] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">{t.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`${registryTableCell} text-sm text-gray-300 tabular-nums`}>
                    {t.row_count.toLocaleString("es-CO")}
                  </td>
                  <td className={`${registryTableCell} text-sm text-gray-400`}>{t.columns.length}</td>
                  <td className={`${registryTableCell} text-xs text-gray-500 whitespace-nowrap`}>
                    {new Date(t.updated_at).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                    <NoovaAnchoredMenu
                      open={openMenuId === t.id}
                      onClose={() => setOpenMenuId(null)}
                      menuClassName="min-w-[140px]"
                      anchor={
                        <button
                          type="button"
                          disabled={deletingId === t.id}
                          onClick={e => {
                            e.stopPropagation();
                            setOpenMenuId(prev => (prev === t.id ? null : t.id));
                          }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06] disabled:opacity-40"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                    >
                      <NoovaListMenuItem
                        onClick={() => {
                          setOpenMenuId(null);
                          router.push(`/dashboard/tablas/${t.id}`);
                        }}
                      >
                        Abrir tabla
                      </NoovaListMenuItem>
                      <NoovaListMenuItem
                        danger
                        onClick={() => void deleteTable(t.id, t.name)}
                      >
                        Eliminar
                      </NoovaListMenuItem>
                    </NoovaAnchoredMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <DataTableImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={tableId => router.push(`/dashboard/tablas/${tableId}`)}
      />
    </>
  );
}
