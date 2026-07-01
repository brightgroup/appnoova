"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Table2, Upload } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import type { CampaignAudienceTableRecord } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import { CampaignWizardPanel } from "@/components/campaigns/CampaignWizardPanel";

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
  onLinked: (audienceTableId: string) => void;
}

export function CampaignStepAudience({
  campaignId,
  audienceTableId,
  existingTables,
  onLinked,
}: CampaignStepAudienceProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AudienceMode>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = useCallback(async (f: File) => {
    setLoading(true);
    setError("");
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
    if (f) void loadPreview(f);
  };

  const uploadAndLink = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    if (preview?.suggested_name) form.append("name", preview.suggested_name);
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
    onLinked(json.audience_table_id);
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
    onLinked(json.audience_table_id);
  };

  const linkedTable = existingTables.find(t => t.id === audienceTableId);

  return (
    <CampaignWizardPanel
      title="Conectar audiencia"
      description="Sube un Excel con tus contactos o usa una tabla que ya tengas en Noova. Incluye al menos teléfono y nombre."
    >
      <div className="space-y-5">
        {audienceTableId && linkedTable ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] p-4">
            <div className="flex items-start gap-3">
              <Table2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">{linkedTable.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {linkedTable.row_count} contactos · {linkedTable.columns.length} columnas
                </p>
                <p className="text-xs text-emerald-400/90 mt-2">Audiencia conectada</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  mode === "upload"
                    ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10"
                    : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
                }`}
              >
                <Upload className="w-5 h-5 text-[#a5a5ff] mb-2" />
                <p className="text-sm font-medium text-white">Subir Excel</p>
                <p className="text-xs text-gray-500 mt-1">.xlsx o .csv · importación única</p>
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  mode === "existing"
                    ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10"
                    : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
                }`}
              >
                <Table2 className="w-5 h-5 text-[#a5a5ff] mb-2" />
                <p className="text-sm font-medium text-white">Tabla en Noova</p>
                <p className="text-xs text-gray-500 mt-1">Editable en tiempo real</p>
              </button>
            </div>

            {mode === "upload" && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => handleFile(e.target.files?.[0] ?? null)}
                />
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleFile(f);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? "border-[#5b5bf6]/60 bg-[#5b5bf6]/5"
                      : "border-white/[.12] hover:border-white/[.20] bg-white/[.02]"
                  }`}
                >
                  {loading ? (
                    <Loader2 className="w-8 h-8 text-gray-500 animate-spin mx-auto" />
                  ) : (
                    <FileSpreadsheet className="w-8 h-8 text-gray-500 mx-auto" />
                  )}
                  <p className="text-sm text-gray-300 mt-3">
                    {file ? file.name : "Arrastra tu Excel o haz clic para seleccionar"}
                  </p>
                </div>

                {preview && (
                  <div className="mt-4 rounded-xl border border-white/[.08] p-4">
                    <p className="text-xs text-gray-400">
                      {preview.row_count} filas · {preview.columns.length} columnas detectadas
                    </p>
                    <button
                      type="button"
                      onClick={() => void uploadAndLink()}
                      disabled={loading}
                      className="mt-3 text-sm font-medium text-[#a5a5ff] hover:text-white"
                    >
                      Importar y continuar →
                    </button>
                  </div>
                )}
              </div>
            )}

            {mode === "existing" && (
              <div className="space-y-3">
                {existingTables.length === 0 ? (
                  <p className="text-sm text-gray-500">Aún no tienes tablas de audiencia. Sube un Excel primero.</p>
                ) : (
                  <>
                    <select
                      value={selectedTableId}
                      onChange={e => setSelectedTableId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.10] text-sm text-white"
                    >
                      <option value="">Seleccionar tabla…</option>
                      {existingTables.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.row_count} filas)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void linkExisting()}
                      disabled={!selectedTableId || loading}
                      className="text-sm font-medium text-[#a5a5ff] hover:text-white disabled:opacity-40"
                    >
                      Usar esta tabla →
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
          <span className="text-gray-500">💡</span>
          Tu archivo debe incluir una columna con el teléfono y otra con el nombre del contacto.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/[.06] border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </CampaignWizardPanel>
  );
}
