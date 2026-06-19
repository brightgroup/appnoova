"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, FileSpreadsheet, X } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { DataTableColumn } from "@/types/data-table";

export interface ImportPreview {
  suggested_name: string;
  sheet_name: string;
  columns: DataTableColumn[];
  row_count: number;
  sample_rows: Record<string, string | number | boolean | null>[];
  validation?: {
    ok: boolean;
    error?: string;
    warnings: string[];
    column_mapping: {
      product: string | null;
      category: string | null;
      sku: string | null;
    };
    search_mode: "full_catalog" | "smart_search";
  };
}

function formatPreviewCell(value: unknown, col: DataTableColumn): string {
  if (value == null || value === "") return "—";
  if (col.type === "number" && typeof value === "number") {
    const l = col.label.toLowerCase();
    if (l.includes("precio") || l.includes("costo")) {
      return "$" + new Intl.NumberFormat("es-CO").format(Math.round(value));
    }
    return new Intl.NumberFormat("es-CO").format(value);
  }
  return String(value);
}

interface DataTableImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (tableId: string) => void;
  /** Si se pasa, reimporta sobre tabla existente */
  tableId?: string;
  title?: string;
}

export function DataTableImportDialog({
  open,
  onClose,
  onImported,
  tableId,
  title = "Importar Excel",
}: DataTableImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [tableName, setTableName] = useState("");

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError("");
    setTableName("");
    setDragOver(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const loadPreview = async (f: File) => {
    setFile(f);
    setLoadingPreview(true);
    setError("");
    setPreview(null);
    const fd = new FormData();
    fd.append("file", f);
    const res = await authFetch("/api/data-tables/preview", { method: "POST", body: fd });
    const json = await res.json();
    setLoadingPreview(false);
    if (!res.ok) {
      setError(json.error ?? "Error al leer el archivo");
      return;
    }
    setPreview(json);
    setTableName(json.suggested_name ?? "");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void loadPreview(f);
  };

  const confirmImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    if (tableName.trim()) fd.append("name", tableName.trim());

    const url = tableId ? `/api/data-tables/${tableId}` : "/api/data-tables";
    const res = await authFetch(url, { method: "POST", body: fd });
    const json = await res.json();
    setImporting(false);
    if (!res.ok) {
      setError(json.error ?? "Error al importar");
      return;
    }
    onImported(tableId ?? json.table.id);
    handleClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-white/[.12] bg-[#12131a] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08] shrink-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={handleClose} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto overflow-x-hidden min-h-0 flex-1 min-w-0">
          {!preview && !loadingPreview && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#5b5bf6] bg-[#5b5bf6]/10"
                    : "border-white/[.12] bg-white/[.02] hover:border-white/[.20] hover:bg-white/[.04]"
                }`}
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-[#5b5bf6]" />
                <p className="text-sm text-white font-medium">Arrastra tu Excel aquí</p>
                <p className="text-xs text-gray-500 mt-1">o haz clic para seleccionar · .xlsx, .xls, .csv · máx. 1.000 registros</p>
                <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                  Columnas recomendadas: Producto, Categoría, SKU/Código, Precio. Puedes agregar más columnas sin problema.
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void loadPreview(f);
                  e.target.value = "";
                }}
              />
            </>
          )}

          {loadingPreview && (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#5b5bf6]" />
              Analizando archivo…
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-white/[.08] bg-white/[.03] p-4">
                <FileSpreadsheet className="w-5 h-5 text-[#5b5bf6] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{file?.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Hoja: {preview.sheet_name}</p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs text-gray-500 hover:text-white shrink-0"
                >
                  Cambiar
                </button>
              </div>

              {!tableId && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Nombre de la tabla</label>
                  <input
                    value={tableName}
                    onChange={e => setTableName(e.target.value)}
                    className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[.08] bg-white/[.02] p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Registros</p>
                  <p className="text-xl font-bold text-white mt-1">{preview.row_count}</p>
                </div>
                <div className="rounded-lg border border-white/[.08] bg-white/[.02] p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Columnas</p>
                  <p className="text-xl font-bold text-white mt-1">{preview.columns.length}</p>
                </div>
              </div>

              {preview.validation && (
                <div className="rounded-lg border border-white/[.08] bg-white/[.02] p-3 space-y-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Columnas clave detectadas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Producto </span>
                      <span className={preview.validation.column_mapping.product ? "text-emerald-400" : "text-red-400"}>
                        {preview.validation.column_mapping.product ?? "No detectada"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Categoría </span>
                      <span className={preview.validation.column_mapping.category ? "text-emerald-400" : "text-amber-400"}>
                        {preview.validation.column_mapping.category ?? "Opcional"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">SKU </span>
                      <span className={preview.validation.column_mapping.sku ? "text-emerald-400" : "text-amber-400"}>
                        {preview.validation.column_mapping.sku ?? "Opcional"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {preview.validation.search_mode === "full_catalog"
                      ? "Modo catálogo completo: la IA verá todos los productos en cada mensaje."
                      : "Modo búsqueda inteligente: la IA recibe solo los productos relevantes a cada pregunta."}
                  </p>
                </div>
              )}

              {preview.validation && !preview.validation.ok && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {preview.validation.error}
                </div>
              )}

              {preview.validation?.warnings.map(w => (
                <div
                  key={w}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90"
                >
                  {w}
                </div>
              ))}

              <div>
                <p className="text-xs text-gray-400 mb-2">Vista previa (primeras filas)</p>
                <div className="overflow-x-auto rounded-lg border border-white/[.08] max-h-48 overflow-y-auto">
                  <table className="w-full text-xs min-w-max">
                    <thead className="sticky top-0 bg-[#12131a]">
                      <tr className="border-b border-white/[.08]">
                        {preview.columns.map(c => (
                          <th key={c.key} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.sample_rows ?? []).map((row, i) => (
                        <tr key={i} className="border-b border-white/[.04] last:border-0">
                          {preview.columns.map(c => (
                            <td key={c.key} className="px-2 py-1.5 text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                              {formatPreviewCell(row[c.key], c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">Columnas detectadas</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.columns.map(c => (
                    <span
                      key={c.key}
                      className="text-[10px] px-2 py-1 rounded-full border border-white/[.08] bg-white/[.03] text-gray-300"
                    >
                      {c.label}
                      {c.filterable && <span className="text-[#a5a5ff] ml-1">filtro</span>}
                    </span>
                  ))}
                </div>
              </div>

              {tableId && (
                <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Esto reemplazará todas las filas actuales de la tabla.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[.08] shrink-0">
          <button type="button" onClick={handleClose} className={btnGhost}>
            Cancelar
          </button>
          {preview && (
            <button
              type="button"
              onClick={confirmImport}
              disabled={
                importing ||
                (!tableId && !tableName.trim()) ||
                preview.validation?.ok === false
              }
              className={`${btnPrimary} gap-2`}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {tableId ? "Confirmar reimportación" : "Confirmar importación"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
