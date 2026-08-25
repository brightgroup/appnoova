"use client";

import { useState } from "react";
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnGhost, btnPrimary } from "@/lib/brand-ui";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { InventoryImportField } from "@/lib/erp/import";

interface InventoryImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface PreviewResponse {
  headers: string[];
  row_count: number;
  sample_rows: Record<string, string>[];
  suggested_map: Record<InventoryImportField, string | null>;
}

interface ImportResult {
  created: number;
  movements_created?: number;
  skipped_existing: number;
  duplicate_codigos: { codigo: string; rows: number[] }[];
  missing_codigo: number[];
  missing_nombre: number[];
}

const FIELD_LABELS: Record<InventoryImportField, string> = {
  codigo: "Código *",
  nombre: "Producto *",
  marca: "Marca",
  responsable: "Responsable",
  stockMinimo: "Stock mínimo",
  existencia: "Existencia actual"
};

const FIELD_ORDER: InventoryImportField[] = ["codigo", "nombre", "marca", "responsable", "stockMinimo", "existencia"];

export function InventoryImportDialog({ open, onClose, onImported }: InventoryImportDialogProps) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [columnMap, setColumnMap] = useState<Partial<Record<InventoryImportField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setColumnMap({});
    setError(null);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function analyzeFile() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await authFetch("/api/erp/inventario/import/preview", { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo leer el archivo");
      return;
    }
    setPreview(json as PreviewResponse);
    const suggested = (json as PreviewResponse).suggested_map;
    setColumnMap(
      Object.fromEntries(FIELD_ORDER.map(f => [f, suggested[f] ?? ""])) as Record<InventoryImportField, string>
    );
    setStep("map");
  }

  async function confirmImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("column_map", JSON.stringify(columnMap));
    const res = await authFetch("/api/erp/inventario/import", { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo importar");
      return;
    }
    setResult(json as ImportResult);
    setStep("result");
    onImported();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] sticky top-0 bg-noova-surface z-10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#0f7eff]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text)]">Importar inventario</h2>
          </div>
          <button type="button" onClick={handleClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {step === "upload" && (
            <>
              <p className="text-sm text-gray-400">
                Sube el Excel del listado de productos (primera hoja). Después de analizarlo, confirmas qué
                columna corresponde a cada campo antes de crear nada.
              </p>
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[.16] bg-white/[.03] px-6 py-10 cursor-pointer hover:border-[#0f7eff]/40 transition-colors">
                <Upload className="w-6 h-6 text-gray-500" />
                <span className="text-sm text-gray-300">{file ? file.name : "Elegir archivo .xlsx"}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          )}

          {step === "map" && preview && (
            <>
              <p className="text-sm text-gray-400">
                {preview.row_count} filas detectadas. Confirma qué columna es cada campo — el código y el
                producto son obligatorios.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_ORDER.map(field => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-1.5">{FIELD_LABELS[field]}</label>
                    <NoovaSelect
                      value={columnMap[field] ?? ""}
                      onChange={v => setColumnMap(prev => ({ ...prev, [field]: v }))}
                      options={preview.headers.map(h => ({ value: h, label: h }))}
                      allowEmpty
                      emptyLabel="No importar"
                    />
                  </div>
                ))}
              </div>
              {preview.sample_rows.length > 0 && (
                <div className="rounded-xl border border-white/[.08] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[.08] text-gray-500">
                        {preview.headers.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample_rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-white/[.04] text-gray-400">
                          {preview.headers.map(h => (
                            <td key={h} className="px-3 py-1.5 whitespace-nowrap">{row[h] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {step === "result" && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm">
                  {result.created} producto(s) creado(s)
                  {result.movements_created ? ` · ${result.movements_created} con existencia inicial` : ""}.
                </p>
              </div>
              {result.skipped_existing > 0 && (
                <p className="text-sm text-gray-400">{result.skipped_existing} ya existían (se omitieron).</p>
              )}
              {(result.duplicate_codigos.length > 0 || result.missing_codigo.length > 0 || result.missing_nombre.length > 0) && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" /> Filas omitidas
                  </div>
                  {result.duplicate_codigos.length > 0 && (
                    <p>
                      {result.duplicate_codigos.length} código(s) duplicado(s) — se usó la primera fila de cada uno:{" "}
                      {result.duplicate_codigos.slice(0, 8).map(d => d.codigo).join(", ")}
                      {result.duplicate_codigos.length > 8 ? "…" : ""}
                    </p>
                  )}
                  {result.missing_codigo.length > 0 && (
                    <p>{result.missing_codigo.length} fila(s) sin código (filas {result.missing_codigo.slice(0, 10).join(", ")}{result.missing_codigo.length > 10 ? "…" : ""}).</p>
                  )}
                  {result.missing_nombre.length > 0 && (
                    <p>{result.missing_nombre.length} fila(s) sin producto (filas {result.missing_nombre.slice(0, 10).join(", ")}{result.missing_nombre.length > 10 ? "…" : ""}).</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08] sticky bottom-0 bg-noova-surface">
          {step === "result" ? (
            <button type="button" onClick={handleClose} className={btnPrimary}>Cerrar</button>
          ) : (
            <>
              <button type="button" onClick={handleClose} disabled={busy} className={btnGhost}>Cancelar</button>
              {step === "upload" && (
                <button type="button" disabled={!file || busy} onClick={analyzeFile} className={btnPrimary}>
                  {busy ? "Analizando…" : "Analizar archivo"}
                </button>
              )}
              {step === "map" && (
                <button
                  type="button"
                  disabled={!columnMap.codigo || !columnMap.nombre || busy}
                  onClick={confirmImport}
                  className={btnPrimary}
                >
                  {busy ? "Importando…" : "Importar"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
