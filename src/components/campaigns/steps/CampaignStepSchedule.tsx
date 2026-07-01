"use client";

import type { CampaignScheduleConfig, CampaignTriggerRule } from "@/types/voice-campaign";
import { CAMPAIGN_DAY_KEYS, CAMPAIGN_DAY_LABELS } from "@/types/voice-campaign";
import { CAMPAIGN_TIMEZONES } from "@/lib/campaigns/record";
import {
  CampaignFieldLabel,
  CampaignInput,
  CampaignSelect,
  CampaignWizardPanel,
} from "@/components/campaigns/CampaignWizardPanel";

interface CampaignStepScheduleProps {
  schedule: CampaignScheduleConfig;
  trigger: CampaignTriggerRule;
  onScheduleChange: (schedule: CampaignScheduleConfig) => void;
  onTriggerChange: (trigger: CampaignTriggerRule) => void;
}

export function CampaignStepSchedule({
  schedule,
  trigger,
  onScheduleChange,
  onTriggerChange,
}: CampaignStepScheduleProps) {
  const updateSlot = (day: string, patch: Partial<{ enabled: boolean; start: string; end: string }>) => {
    onScheduleChange({
      ...schedule,
      day_slots: {
        ...schedule.day_slots,
        [day]: { ...schedule.day_slots[day], ...patch },
      },
    });
  };

  return (
    <CampaignWizardPanel
      title="Configura tu campaña"
      description="Define fechas, días activos, franjas horarias e intentos de llamada. Elige cuándo llamar a cada contacto."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <CampaignFieldLabel label="Fecha de inicio" required />
            <CampaignInput
              type="date"
              value={schedule.start_date}
              onChange={e => onScheduleChange({ ...schedule, start_date: e.target.value })}
            />
          </div>
          <div>
            <CampaignFieldLabel label="Fecha de finalización" hint="Opcional" />
            <CampaignInput
              type="date"
              value={schedule.end_date ?? ""}
              onChange={e =>
                onScheduleChange({ ...schedule, end_date: e.target.value || null })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <CampaignFieldLabel label="Intentos máximos por contacto" />
            <CampaignSelect
              value={String(schedule.max_attempts_per_contact)}
              onChange={e =>
                onScheduleChange({
                  ...schedule,
                  max_attempts_per_contact: Number(e.target.value),
                })
              }
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </CampaignSelect>
          </div>
          <div>
            <CampaignFieldLabel label="Intentos por día" />
            <CampaignSelect
              value={String(schedule.attempts_per_day)}
              onChange={e =>
                onScheduleChange({ ...schedule, attempts_per_day: Number(e.target.value) })
              }
            >
              {[1, 2, 3].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </CampaignSelect>
          </div>
          <div>
            <CampaignFieldLabel label="Huso horario" />
            <CampaignSelect
              value={schedule.timezone}
              onChange={e => onScheduleChange({ ...schedule, timezone: e.target.value })}
            >
              {CAMPAIGN_TIMEZONES.map(tz => (
                <option key={tz.id} value={tz.id}>{tz.label}</option>
              ))}
            </CampaignSelect>
          </div>
        </div>

        <div>
          <CampaignFieldLabel label="Horarios por día" />
          <div className="rounded-xl border border-white/[.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[.06] bg-white/[.02]">
                  <th className="text-left px-3 py-2 text-gray-500 font-medium w-28">Día</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Inicio</th>
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">Fin</th>
                </tr>
              </thead>
              <tbody>
                {CAMPAIGN_DAY_KEYS.map(day => {
                  const slot = schedule.day_slots[day] ?? {
                    enabled: false,
                    start: "08:00",
                    end: "18:00",
                  };
                  return (
                    <tr key={day} className="border-b border-white/[.04] last:border-0">
                      <td className="px-3 py-2.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={slot.enabled}
                            onChange={e => updateSlot(day, { enabled: e.target.checked })}
                            className="rounded border-white/20 bg-white/5 text-[#5b5bf6] focus:ring-[#5b5bf6]/40"
                          />
                          <span className="text-gray-300">{CAMPAIGN_DAY_LABELS[day]}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <CampaignInput
                          type="time"
                          value={slot.start}
                          disabled={!slot.enabled}
                          onChange={e => updateSlot(day, { start: e.target.value })}
                          className="py-1.5 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <CampaignInput
                          type="time"
                          value={slot.end}
                          disabled={!slot.enabled}
                          onChange={e => updateSlot(day, { end: e.target.value })}
                          className="py-1.5 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <CampaignFieldLabel
            label="¿Cuándo llamar a cada contacto?"
            hint="Elige la regla que define el momento de la llamada."
          />
          <div className="space-y-2">
            {(
              [
                {
                  type: "excel_date" as const,
                  title: "Según fecha en el Excel",
                  desc: "Ideal para renovaciones: llama N días antes de una columna de fecha.",
                },
                {
                  type: "on_activate" as const,
                  title: "Al activar la campaña",
                  desc: "Llama a todos en cuanto la campaña esté activa.",
                },
                {
                  type: "fixed_datetime" as const,
                  title: "Fecha y hora fija para todos",
                  desc: "Todos los contactos en el mismo momento.",
                },
              ] as const
            ).map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => onTriggerChange({ ...trigger, type: opt.type })}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  trigger.type === opt.type
                    ? "border-[#5b5bf6]/50 bg-[#5b5bf6]/10"
                    : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04]"
                }`}
              >
                <p className="text-sm font-medium text-white">{opt.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {trigger.type === "excel_date" && (
            <div className="mt-3">
              <CampaignFieldLabel label="Días de anticipación" hint="Negativo = antes de la fecha" />
              <CampaignSelect
                value={String(trigger.offset_days ?? -30)}
                onChange={e =>
                  onTriggerChange({ ...trigger, offset_days: Number(e.target.value) })
                }
              >
                {[-60, -45, -30, -15, -7, -3, 0].map(n => (
                  <option key={n} value={n}>
                    {n === 0 ? "El mismo día" : `${Math.abs(n)} días antes`}
                  </option>
                ))}
              </CampaignSelect>
            </div>
          )}

          {trigger.type === "fixed_datetime" && (
            <div className="mt-3">
              <CampaignFieldLabel label="Fecha y hora" />
              <CampaignInput
                type="datetime-local"
                value={trigger.fixed_at?.slice(0, 16) ?? ""}
                onChange={e =>
                  onTriggerChange({
                    ...trigger,
                    fixed_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </div>
          )}
        </div>
      </div>
    </CampaignWizardPanel>
  );
}
