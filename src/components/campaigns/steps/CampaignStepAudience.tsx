"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  PhoneOff,
  Plus,
  Table2,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { autoMapCampaignColumnsFromSchema } from "@/lib/campaigns/column-mapping";
import { exportRowsToCsv, stampedFilename } from "@/lib/export-table";
import { CampaignMappingFields } from "@/components/campaigns/CampaignMappingFields";
import { CampaignSelect, CampaignWizardPanel } from "@/components/campaigns/CampaignWizardPanel";
import type {
  CampaignAudienceTableRecord,
  CampaignFieldMapping,
  CampaignImportPolicy,
  CampaignImportResult,
  CampaignImportSummary,
} from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

type AudienceMode = "upload" | "existing";
type UploadPhase = "map" | "confirm" | "done";

interface AudiencePreview {
  suggested_name: string;
  row_count: number;
  columns: DataTableColumn[];
  sample_rows: Record<string, string | number | boolean | null>[];
}

/** Campos de la ficha del contacto que puede alimentar el Excel. */
const CONTACT_FIELD_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "ciudad", label: "Ciudad" },
  { value: "organizacion", label: "Organización" },
  { value: "documento_id", label: "Documento" },
  { value: "notes", label: "Notas" },
];

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

function SummaryStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "neutral" | "ok" | "warn" | "bad";
}) {
  const tones = {
    neutral: "text-gray-300",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
  };
  return (
    <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3.5 py-3">
      <div className={`flex items-center gap-1.5 ${tones[tone]}`}>
        {icon}
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  );
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
  const [phase, setPhase] = useState<UploadPhase>("map");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [summary, setSummary] = useState<CampaignImportSummary | null>(null);
  const [policy, setPolicy] = useState<CampaignImportPolicy>("skip");
  const [result, setResult] = useState<CampaignImportResult | null>(null);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeColumns = columns.length > 0 ? columns : (preview?.columns ?? []);
  const sampleRows = preview?.sample_rows;
  const contactFields = fieldMapping.contact_fields ?? [];

  const applyAutoMap = useCallback(
    (cols: DataTableColumn[], keepCustom = true) => {
      onColumnsChange(cols);
      const next = autoMapCampaignColumnsFromSchema(cols, triggerNeedsDate);
      onMappingChange({
        ...next,
        custom_fields: keepCustom ? fieldMapping.custom_fields : [],
        contact_fields: keepCustom ? fieldMapping.contact_fields : [],
      });
    },
    [onColumnsChange, onMappingChange, triggerNeedsDate, fieldMapping.custom_fields, fieldMapping.contact_fields]
  );

  const previewMappedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!preview?.columns?.length) return;
    const key = preview.columns.map(c => c.key).join("|");
    if (previewMappedRef.current === key) return;
    previewMappedRef.current = key;
    applyAutoMap(preview.columns, false);
  }, [preview, applyAutoMap]);

  const resetUpload = () => {
    setPreview(null);
    setFile(null);
    setSummary(null);
    setResult(null);
    setPhase("map");
    previewMappedRef.current = null;
  };

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
    resetUpload();
    setFile(f);
    if (f) void loadPreview(f);
  };

  const analyze = async () => {
    if (!file) return;
    if (!fieldMapping.phone_column || !fieldMapping.name_column) {
      setError("Selecciona las columnas de teléfono y nombre");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("field_mapping", JSON.stringify(fieldMapping));
    const res = await authFetch(`/api/campaigns/${campaignId}/audience/analyze`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Error al analizar el archivo");
      return;
    }
    setSummary(json.summary);
    setPhase("confirm");
  };

  const confirmImport = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    if (preview?.suggested_name) form.append("name", preview.suggested_name);
    form.append("field_mapping", JSON.stringify(fieldMapping));
    form.append("contact_policy", policy);
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
    setResult(json.import_result ?? null);
    setPhase("done");
    const cols = preview?.columns ?? activeColumns;
    onLinked(json.audience_table_id, json.auto_map ?? fieldMapping, cols);
  };

  const downloadRejected = () => {
    const rejected = result?.rejected_rows ?? summary?.rejected_rows ?? [];
    if (!rejected.length) return;
    exportRowsToCsv(
      stampedFilename("filas-rechazadas", "csv"),
      [
        { header: "Fila", value: r => r.row_index },
        { header: "Teléfono", value: r => r.phone_raw },
        { header: "Motivo", value: r => r.reason },
      ],
      rejected
    );
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

  const addContactField = () => {
    const used = new Set(contactFields.map(f => f.column_key));
    const unused = activeColumns.find(
      c =>
        c.key !== fieldMapping.phone_column &&
        c.key !== fieldMapping.name_column &&
        !used.has(c.key)
    );
    onMappingChange({
      ...fieldMapping,
      contact_fields: [
        ...contactFields,
        { column_key: unused?.key ?? "", contact_field: "email" },
      ],
    });
  };

  const linkedTable = existingTables.find(t => t.id === audienceTableId);
  const showMapping = activeColumns.length > 0;

  const modeBtn = (id: AudienceMode, icon: React.ReactNode, title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        mode === id
          ? "border-[#0f7eff]/40 bg-[#0f7eff]/8"
          : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
      }`}
    >
      <span className="text-[#99c9ff] shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{desc}</span>
      </span>
    </button>
  );

  const contactFieldsSection = showMapping && (
    <div className="space-y-2.5">
      <div>
        <p className="text-xs text-gray-400">Datos del contacto (opcional)</p>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Columnas del archivo que alimentan la ficha del contacto en el CRM.
        </p>
      </div>
      {contactFields.map((cf, i) => (
        <div key={i} className="flex items-center gap-2">
          <CampaignSelect
            value={cf.column_key}
            onChange={e => {
              const next = [...contactFields];
              next[i] = { ...next[i], column_key: e.target.value };
              onMappingChange({ ...fieldMapping, contact_fields: next });
            }}
            className="flex-1 py-1.5 text-xs"
          >
            <option value="">Columna del archivo…</option>
            {activeColumns.map(c => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </CampaignSelect>
          <span className="text-gray-600 text-xs shrink-0">→</span>
          <CampaignSelect
            value={cf.contact_field}
            onChange={e => {
              const next = [...contactFields];
              next[i] = { ...next[i], contact_field: e.target.value };
              onMappingChange({ ...fieldMapping, contact_fields: next });
            }}
            className="flex-1 py-1.5 text-xs"
          >
            {CONTACT_FIELD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                Ficha → {o.label}
              </option>
            ))}
          </CampaignSelect>
          <button
            type="button"
            onClick={() =>
              onMappingChange({
                ...fieldMapping,
                contact_fields: contactFields.filter((_, j) => j !== i),
              })
            }
            className="p-1.5 text-gray-500 hover:text-red-400 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addContactField}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#99c9ff] hover:text-white"
      >
        <Plus className="w-3.5 h-3.5" /> Vincular columna a la ficha
      </button>
    </div>
  );

  const content = (
    <div className="space-y-5">
      {audienceTableId && linkedTable && phase !== "done" ? (
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
          {embedded && (
            <p className="text-xs text-gray-400">
              Guarda la campaña para continuar con el mapeo de variables, revisión del guion y activación.
            </p>
          )}
          {!embedded && showMapping && (
            <CampaignMappingFields
              campaignId={campaignId}
              mapping={fieldMapping}
              columns={activeColumns}
              triggerNeedsDate={triggerNeedsDate}
              onChange={onMappingChange}
            />
          )}
        </>
      ) : phase === "done" && result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[.05] px-4 py-3.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Audiencia importada</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {result.created_contacts} contactos creados · {result.linked_contacts} vinculados ·{" "}
                {result.rejected} rechazados · {result.suppressed} excluidos por no contactar
                {result.leads_created > 0 ? ` · ${result.leads_created} oportunidades creadas` : ""}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryStat
              icon={<Users className="w-4 h-4" />}
              value={result.enrolled}
              label="Inscritos en la campaña"
              tone="ok"
            />
            <SummaryStat
              icon={<UserPlus className="w-4 h-4" />}
              value={result.created_contacts}
              label="Contactos nuevos en CRM"
              tone="neutral"
            />
            <SummaryStat
              icon={<PhoneOff className="w-4 h-4" />}
              value={result.rejected}
              label="Teléfonos inválidos"
              tone={result.rejected > 0 ? "warn" : "neutral"}
            />
            <SummaryStat
              icon={<Ban className="w-4 h-4" />}
              value={result.suppressed}
              label="Excluidos (no contactar)"
              tone={result.suppressed > 0 ? "bad" : "neutral"}
            />
          </div>
          {result.rejected_rows.length > 0 && (
            <button
              type="button"
              onClick={downloadRejected}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#99c9ff] hover:text-white"
            >
              <Download className="w-3.5 h-3.5" /> Descargar filas rechazadas con su motivo
            </button>
          )}
        </div>
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
                      ? "border-[#0f7eff]/50 bg-[#0f7eff]/5"
                      : "border-white/[.10] hover:border-white/[.18] bg-white/[.02]"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="w-7 h-7 text-gray-500 animate-spin mx-auto" />
                  ) : (
                    <Upload className="w-7 h-7 text-[#0f7eff] mx-auto" />
                  )}
                  <p className="text-sm text-white font-medium mt-3">Arrastra tu Excel aquí</p>
                  <p className="text-[11px] text-gray-500 mt-1">o haz clic para seleccionar</p>
                </div>
              )}

              {preview && phase === "map" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-white/[.08] bg-white/[.02] px-4 py-3">
                    <FileSpreadsheet className="w-4 h-4 text-[#0f7eff] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{file?.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {preview.row_count} filas · {preview.columns.length} columnas
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetUpload}
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

                  {contactFieldsSection}

                  <button
                    type="button"
                    onClick={() => void analyze()}
                    disabled={loading}
                    className="text-sm font-medium text-[#99c9ff] hover:text-white disabled:opacity-40"
                  >
                    {loading ? "Analizando contra el CRM…" : "Analizar contra el CRM →"}
                  </button>
                </div>
              )}

              {preview && phase === "confirm" && summary && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-white">Revisa antes de importar</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {summary.total_rows} filas en el archivo
                      {summary.duplicates_in_file > 0
                        ? ` · ${summary.duplicates_in_file} teléfonos repetidos (cuentan una sola vez)`
                        : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <SummaryStat
                      icon={<Users className="w-4 h-4" />}
                      value={summary.existing_contacts}
                      label="Ya existen en el CRM"
                      tone="neutral"
                    />
                    <SummaryStat
                      icon={<UserPlus className="w-4 h-4" />}
                      value={summary.new_contacts}
                      label="Nuevos — se crearán"
                      tone="ok"
                    />
                    <SummaryStat
                      icon={<PhoneOff className="w-4 h-4" />}
                      value={summary.invalid_phone}
                      label="Teléfono inválido"
                      tone={summary.invalid_phone > 0 ? "warn" : "neutral"}
                    />
                    <SummaryStat
                      icon={<Ban className="w-4 h-4" />}
                      value={summary.suppressed}
                      label="No contactar — se excluyen"
                      tone={summary.suppressed > 0 ? "bad" : "neutral"}
                    />
                  </div>

                  {summary.rejected_rows.length > 0 && (
                    <button
                      type="button"
                      onClick={downloadRejected}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#99c9ff] hover:text-white"
                    >
                      <Download className="w-3.5 h-3.5" /> Descargar filas con teléfono inválido
                    </button>
                  )}

                  {summary.existing_contacts > 0 && (
                    <div className="rounded-lg border border-white/[.08] bg-white/[.02] p-4 space-y-2">
                      <p className="text-xs font-medium text-white">
                        ¿Qué hacemos con los {summary.existing_contacts} contactos que ya existen?
                      </p>
                      {(
                        [
                          {
                            id: "skip" as const,
                            label: "No tocar sus datos",
                            desc: "Solo se inscriben en la campaña (recomendado)",
                          },
                          {
                            id: "fill_empty" as const,
                            label: "Llenar solo campos vacíos",
                            desc: "Lo del Excel completa lo que falte en la ficha",
                          },
                          {
                            id: "overwrite" as const,
                            label: "Sobrescribir con el Excel",
                            desc: "Los datos del archivo reemplazan los de la ficha",
                          },
                        ]
                      ).map(opt => (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${
                            policy === opt.id ? "bg-[#0f7eff]/10" : "hover:bg-white/[.03]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="contact_policy"
                            checked={policy === opt.id}
                            onChange={() => setPolicy(opt.id)}
                            className="mt-0.5 accent-[#0f7eff]"
                          />
                          <span>
                            <span className="block text-xs font-medium text-white">{opt.label}</span>
                            <span className="block text-[11px] text-gray-500">{opt.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setPhase("map")}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Volver al mapeo
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmImport()}
                      disabled={loading}
                      className="text-sm font-medium text-[#99c9ff] hover:text-white disabled:opacity-40"
                    >
                      {loading
                        ? "Importando…"
                        : `Confirmar e inscribir ${summary.existing_contacts + summary.new_contacts} contactos →`}
                    </button>
                  </div>
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
                    className="text-sm font-medium text-[#99c9ff] hover:text-white disabled:opacity-40"
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
