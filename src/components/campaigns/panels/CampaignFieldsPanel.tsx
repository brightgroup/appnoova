"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Lock, Plus, Star, Trash2, Link2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  CampaignInput,
  CampaignSelect,
  CampaignTextarea,
} from "@/components/campaigns/CampaignWizardPanel";
import {
  contactLinkTargets,
  isCampaignConfigLocked,
  newOutputField,
  withFieldKeys,
} from "@/lib/campaigns/output-fields";
import { slugifyVariableKey } from "@/lib/campaigns/render-prompt";
import {
  CAMPAIGN_OUTPUT_FIELD_TYPE_LABELS,
  type CampaignOutputField,
  type CampaignOutputFieldType,
  type VoiceCampaignRecord,
} from "@/types/voice-campaign";
import type { CrmPropertyDefinition } from "@/types/crm";

interface CampaignFieldsPanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

const FIELD_TYPES = Object.entries(CAMPAIGN_OUTPUT_FIELD_TYPE_LABELS) as [
  CampaignOutputFieldType,
  string,
][];

export function CampaignFieldsPanel({ campaign, onChange }: CampaignFieldsPanelProps) {
  const [properties, setProperties] = useState<CrmPropertyDefinition[]>([]);
  const locked = isCampaignConfigLocked(campaign);
  const fields = campaign.output_fields;

  useEffect(() => {
    void (async () => {
      const res = await authFetch("/api/crm/properties?entity=contact");
      const json = await res.json().catch(() => ({}));
      if (res.ok) setProperties(json.properties ?? []);
    })();
  }, []);

  const update = (index: number, patch: Partial<CampaignOutputField>) => {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ output_fields: withFieldKeys(next) });
  };

  const setPrimary = (index: number) => {
    if (locked) return;
    const next = fields.map((f, i) => ({ ...f, is_primary: i === index }));
    onChange({ output_fields: next });
  };

  const addField = () => {
    onChange({
      output_fields: withFieldKeys([...fields, newOutputField({ field_type: "text" })]),
    });
  };

  const removeField = (index: number) => {
    if (locked) return;
    onChange({ output_fields: fields.filter((_, i) => i !== index) });
  };

  const primaryMissing = useMemo(
    () => fields.length > 0 && !fields.some(f => f.is_primary),
    [fields]
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Campos de salida</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Define qué información captura la IA en cada llamada. La instrucción de cada campo
              es literalmente lo que la IA usa para saber qué poner ahí.
            </p>
          </div>
          {locked && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 shrink-0">
              <Lock className="w-3 h-3" /> Estructura congelada
            </span>
          )}
        </div>

        {locked && (
          <p className="text-[11px] text-gray-500 leading-relaxed">
            La campaña ya fue activada: los tipos y las opciones no se pueden cambiar para no
            volver incoherentes los resultados capturados. La instrucción de la IA sí se puede
            seguir ajustando.
          </p>
        )}

        {primaryMissing && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
            Marca un campo tipo lista como <strong>tipificación principal</strong> — el veredicto
            de la llamada. Sin él, la campaña no se puede activar.
          </div>
        )}

        {fields.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/[.10] px-6 py-10 text-center">
            <p className="text-sm text-gray-400">Esta campaña aún no captura información.</p>
            <p className="text-xs text-gray-600 mt-1">
              Ejemplo: &ldquo;Estado del proceso&rdquo;, &ldquo;Nivel de interés&rdquo;, &ldquo;Fecha de visita&rdquo;…
            </p>
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field, i) => {
            const targets = contactLinkTargets(field, properties);
            const isSelect = field.field_type === "select";
            return (
              <div
                key={i}
                className={`rounded-xl border bg-white/[.02] p-4 space-y-3 overflow-hidden ${
                  field.is_primary ? "border-[#5b5bf6]/40" : "border-white/[.08]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="w-4 h-4 text-gray-700 shrink-0 mt-2.5" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <CampaignInput
                      value={field.label}
                      onChange={e => update(i, { label: e.target.value })}
                      placeholder="Nombre del campo (ej. Estado del proceso)"
                    />
                    <CampaignSelect
                      value={field.field_type}
                      onChange={e =>
                        update(i, {
                          field_type: e.target.value as CampaignOutputFieldType,
                          ...(e.target.value !== "select"
                            ? { is_primary: false, options: [] }
                            : {}),
                          contact_link: null,
                        })
                      }
                      disabled={locked}
                      className="max-w-xs"
                    >
                      {FIELD_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </CampaignSelect>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    disabled={locked}
                    className="p-1.5 text-gray-600 hover:text-red-400 disabled:opacity-30 shrink-0 mt-1.5"
                    title={locked ? "No se puede eliminar tras activar" : "Eliminar campo"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {isSelect && (
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">
                      Opciones (una por línea)
                    </label>
                    <CampaignTextarea
                      value={field.options.join("\n")}
                      onChange={e =>
                        update(i, { options: e.target.value.split("\n").map(s => s.trimStart()) })
                      }
                      onBlur={e =>
                        update(i, {
                          options: e.target.value
                            .split("\n")
                            .map(s => s.trim())
                            .filter(Boolean),
                        })
                      }
                      disabled={locked}
                      placeholder={"Visita agendada\nInteresado sin fecha\nNo interesado"}
                      className="min-h-[68px] text-xs font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">
                    Instrucción para la IA
                  </label>
                  <CampaignTextarea
                    value={field.ai_instruction}
                    onChange={e => update(i, { ai_instruction: e.target.value })}
                    placeholder="Ej. Clasifica el estado final del proceso de compra según lo conversado"
                    className="min-h-[56px] text-xs"
                  />
                </div>

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-400 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => update(i, { required: e.target.checked })}
                      className="accent-[#5b5bf6]"
                    />
                    Obligatorio
                  </label>

                  <button
                    type="button"
                    onClick={() => setPrimary(i)}
                    disabled={locked || !isSelect}
                    title={
                      !isSelect
                        ? "Solo un campo tipo lista puede ser la tipificación principal"
                        : "El veredicto de la llamada: define el estado del prospecto"
                    }
                    className={`inline-flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40 shrink-0 ${
                      field.is_primary
                        ? "text-[#a5a5ff] font-medium"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${field.is_primary ? "fill-[#5b5bf6] text-[#5b5bf6]" : ""}`}
                    />
                    Tipificación principal
                  </button>

                  <div className="flex flex-col gap-2 min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                      <CampaignSelect
                        value={field.contact_link?.contact_field ?? ""}
                        onChange={e =>
                          update(i, {
                            contact_link: e.target.value
                              ? {
                                  contact_field: e.target.value,
                                  mode: field.contact_link?.mode ?? "fill_empty",
                                }
                              : null,
                          })
                        }
                        className="min-w-0 flex-1 py-1.5 text-xs sm:max-w-[11rem]"
                      >
                        <option value="">Sin vínculo a la ficha</option>
                        {targets.map(t => (
                          <option key={t.value} value={t.value}>
                            Ficha → {t.label}
                          </option>
                        ))}
                      </CampaignSelect>
                    </div>
                    {field.contact_link && (
                      <CampaignSelect
                        value={field.contact_link.mode}
                        onChange={e =>
                          update(i, {
                            contact_link: {
                              contact_field: field.contact_link!.contact_field,
                              mode: e.target.value as "overwrite" | "fill_empty",
                            },
                          })
                        }
                        className="min-w-0 w-full py-1.5 text-xs sm:w-auto sm:max-w-[10.5rem]"
                      >
                        <option value="fill_empty">Solo si está vacío</option>
                        <option value="overwrite">Sobrescribir siempre</option>
                      </CampaignSelect>
                    )}
                  </div>
                </div>

                {field.key && (
                  <p className="text-[10px] text-gray-600 font-mono">
                    key: {field.key || slugifyVariableKey(field.label)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!locked && (
          <button
            type="button"
            onClick={addField}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a5a5ff] hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar campo
          </button>
        )}
      </div>
    </div>
  );
}
