"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Table2, Upload } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { autoMapCampaignColumnsFromSchema } from "@/lib/campaigns/column-mapping";
import { CampaignMappingFields } from "@/components/campaigns/CampaignMappingFields";
import { CampaignWizardPanel } from "@/components/campaigns/CampaignWizardPanel";
import type { CampaignAudienceTableRecord, CampaignFieldMapping } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

type AudienceMode = "upload" | "existing";

interface AudiencePreview {
  suggested_name: string;
  row_count: number;
  columns: DataTableColumn[];
  sample_rows: Record<string, string | number | boolean | null>[];
}

interface CampaignStepAudienceProps {
  campaignId: string;
  audienceTableId: string | null;
  existingTables: CampaignAudienceTableRecord[];
  columns: DataTableColumn[];
  fieldMapping: CampaignFieldMapping;
  triggerNeedsDate: boolean;
  onColumnsChange: (columns: DataTableColumn[]) => void;
  onMappingChange: (mapping: CampaignFieldMapping) => void;
  onLinked: (
    audienceTableId: string,
    mapping?: CampaignFieldMapping,
    columns?: DataTableColumn[]
  ) => void;
  embedded?: boolean;
}

export function CampaignStepAudience({
  campaignId,
  audienceTableId,
  existingTables,
  columns,
  fieldMapping,
  triggerNeedsDate,
  onColumnsChange,
  onMappingChange,
  onLinked,
  embedded,
}: CampaignStepAudienceProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AudienceMode>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeColumns = columns.length > 0 ? columns : (preview?.columns ?? []);
  const sampleRows = preview?.sample_rows;

  const applyAutoMap = useCallback(
    (cols: DataTableColumn[], keepCustom = true) => {
      onColumnsChange(cols);
      const next = autoMapCampaignColumnsFromSchema(cols, triggerNeedsDate);
      onMappingChange({
        ...next,
        custom_fields: keepCustom ? fieldMapping.custom_fields : [],
      });
    },
    [onColumnsChange, onMappingChange, triggerNeedsDate, fieldMapping.custom_fields]
  );

  const previewMappedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!preview?.columns?.length) return;
    const key = preview.columns.map(c => c.key).join("|");
    if (previewMappedRef.current === key) return;
    previewMappedRef.current = key;
    applyAutoMap(preview.columns, false);
  }, [preview, applyAutoMap]);

  const loadPreview = useCallback(async (f: File) => {
    setLoading(true);
    setError("");
    previewMappedRef.current = null;
    const form = new FormData();
    form.append("file", f);
    const res = await authFetch("/api/campaigns/audience/preview", {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "No se pudo leer el archivo");
      setPreview(null);
      return;
    }
    setPreview(json);
  }, []);

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    previewMappedRef.current = null;
    if (f) void loadPreview(f);
  };

  const uploadAndLink = async () => {
    if (!file) return;
    if (!fieldMapping.phone_column || !fieldMapping.name_column) {
      setError("Selecciona las columnas de teléfono y nombre");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    if (preview?.suggested_name) form.append("name", preview.suggested_name);
    form.append("field_mapping", JSON.stringify(fieldMapping));
    const res = await authFetch(`/api/campaigns/${campaignId}/audience`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Error al importar");
      return;
    }
    const cols = preview?.columns ?? activeColumns;
    onLinked(json.audience_table_id, json.auto_map ?? fieldMapping, cols);
    setPreview(null);
    setFile(null);
  };

  const linkExisting = async () => {
    if (!selectedTableId) return;
    setLoading(true);
    setError("");
    const res = await authFetch(`/api/campaigns/${campaignId}/audience`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience_table_id: selectedTableId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Error al vincular tabla");
      return;
    }
    const table = existingTables.find(t => t.id === selectedTableId);
    const cols = table?.columns ?? [];
    const mapping = (json.auto_map as CampaignFieldMapping | undefined) ?? fieldMapping;
    if (cols.length) {
      onColumnsChange(cols);
      onMappingChange(mapping);
    }
    onLinked(json.audience_table_id, mapping, cols);
  };

  const linkedTable = existingTables.find(t => t.id === audienceTableId);
  const showMapping = activeColumns.length > 0;

  const modeBtn = (id: AudienceMode, icon: React.ReactNode, title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        mode === id
          ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/8"
          : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
      }`}
    >
      <span className="text-[#a5a5ff] shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{desc}</span>
      </span>
    </button>
  );

  const content = (
    <div className="space-y-5">
      {audienceTableId && linkedTable ? (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[.05] px-4 py-3">
            <Table2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{linkedTable.name}</p>
              <p className="text-[11px] text-gray-500">
                {linkedTable.row_count} contactos · {linkedTable.columns.length} columnas
              </p>
            </div>
            <span className="text-[10px] text-emerald-400 shrink-0">Conectada</span>
          </div>
          {showMapping && (
            <CampaignMappingFields
              campaignId={campaignId}
              mapping={fieldMapping}
              columns={activeColumns}
              triggerNeedsDate={triggerNeedsDate}
              onChange={onMappingChange}
            />
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {modeBtn("upload", <Upload className="w-4 h-4" />, "Subir Excel", ".xlsx o .csv")}
            {modeBtn("existing", <Table2 className="w-4 h-4" />, "Tabla existente", "Audiencia guardada")}
          </div>

          {mode === "upload" && (
            <div className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0] ?? null)}
              />
              {!preview && (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleFile(f);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/5"
                      : "border-white/[.10] hover:border-white/[.18] bg-white/[.02]"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="w-7 h-7 text-gray-500 animate-spin mx-auto" />
                  ) : (
                    <Upload className="w-7 h-7 text-[#5b5bf6] mx-auto" />
                  )}
                  <p className="text-sm text-white font-medium mt-3">Arrastra tu Excel aquí</p>
                  <p className="text-[11px] text-gray-500 mt-1">o haz clic para seleccionar</p>
                </div>
              )}

              {preview && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-white/[.08] bg-white/[.02] px-4 py-3">
                    <FileSpreadsheet className="w-4 h-4 text-[#5b5bf6] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{file?.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {preview.row_count} filas · {preview.columns.length} columnas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreview(null);
                        setFile(null);
                        previewMappedRef.current = null;
                      }}
                      className="text-[11px] text-gray-500 hover:text-white shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>

                  {showMapping && (
                    <CampaignMappingFields
                      mapping={fieldMapping}
                      columns={activeColumns}
                      triggerNeedsDate={triggerNeedsDate}
                      onChange={onMappingChange}
                      sampleRows={sampleRows}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => void uploadAndLink()}
                    disabled={loading}
                    className="text-sm font-medium text-[#a5a5ff] hover:text-white disabled:opacity-40"
                  >
                    {loading ? "Importando…" : "Importar audiencia →"}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "existing" && (
            <div className="space-y-4">
              {existingTables.length === 0 ? (
                <p className="text-sm text-gray-500">Sube un Excel primero para crear una audiencia.</p>
              ) : (
                <>
                  <select
                    value={selectedTableId}
                    onChange={e => {
                      setSelectedTableId(e.target.value);
                      const table = existingTables.find(t => t.id === e.target.value);
                      if (table?.columns?.length) applyAutoMap(table.columns, false);
                    }}
                    className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white"
                  >
                    <option value="">Seleccionar tabla…</option>
                    {existingTables.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.row_count} filas)
                      </option>
                    ))}
                  </select>
                  {selectedTableId && showMapping && (
                    <CampaignMappingFields
                      campaignId={campaignId}
                      mapping={fieldMapping}
                      columns={activeColumns}
                      triggerNeedsDate={triggerNeedsDate}
                      onChange={onMappingChange}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void linkExisting()}
                    disabled={!selectedTableId || loading}
                    className="text-sm font-medium text-[#a5a5ff] hover:text-white disabled:opacity-40"
                  >
                    {loading ? "Vinculando…" : "Usar esta tabla →"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );

  if (embedded) return content;
  return <CampaignWizardPanel>{content}</CampaignWizardPanel>;
}
