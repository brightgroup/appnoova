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
  embedded?: boolean;
}

export function CampaignStepSchedule({
  schedule,
  trigger,
  onScheduleChange,
  onTriggerChange,
  embedded,
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

  const content = (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Periodo</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <CampaignFieldLabel label="Fecha de inicio" required />
            <CampaignInput
              type="date"
              value={schedule.start_date}
              onChange={e => onScheduleChange({ ...schedule, start_date: e.target.value })}
            />
          </div>
          <div>
            <CampaignFieldLabel label="Fecha de finalización" hint="opcional" />
            <CampaignInput
              type="date"
              value={schedule.end_date ?? ""}
              onChange={e =>
                onScheduleChange({ ...schedule, end_date: e.target.value || null })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Límites</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <CampaignFieldLabel label="Intentos máximos" />
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
      </section>

      <section className="space-y-3">
        <CampaignFieldLabel label="Horarios por día" />
        <div className="rounded-lg border border-white/[.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[.06] bg-white/[.02]">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 w-32">
                  Día
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Inicio
                </th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  Fin
                </th>
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
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={e => updateSlot(day, { enabled: e.target.checked })}
                          className="rounded border-white/20 bg-white/5 text-[#0f7eff]"
                        />
                        <span className="text-sm text-gray-300">{CAMPAIGN_DAY_LABELS[day]}</span>
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
      </section>

      <section className="space-y-3">
        <CampaignFieldLabel
          label="¿Cuándo llamar?"
          hint="regla de programación por contacto"
        />
        <div className="grid grid-cols-1 gap-2">
          {(
            [
              {
                type: "excel_date" as const,
                title: "Según fecha en el Excel",
                desc: "Llama N días antes de una columna de fecha.",
              },
              {
                type: "on_activate" as const,
                title: "Al activar la campaña",
                desc: "Todos los contactos al activar.",
              },
              {
                type: "fixed_datetime" as const,
                title: "Fecha y hora fija",
                desc: "Mismo momento para todos.",
              },
            ] as const
          ).map(opt => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onTriggerChange({ ...trigger, type: opt.type })}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                trigger.type === opt.type
                  ? "border-[#0f7eff]/50 bg-[#0f7eff]/12 ring-1 ring-[#0f7eff]/25"
                  : "border-white/[.08] bg-white/[.02] hover:bg-white/[.04] hover:border-white/[.14]"
              }`}
            >
              <p className={`text-sm font-medium ${trigger.type === opt.type ? "text-white" : "text-gray-300"}`}>
                {opt.title}
              </p>
              <p className={`text-[11px] mt-0.5 ${trigger.type === opt.type ? "text-gray-400" : "text-gray-500"}`}>
                {opt.desc}
              </p>
            </button>
          ))}
        </div>

        {trigger.type === "excel_date" && (
          <div className="max-w-xs">
            <CampaignFieldLabel label="Días de anticipación" />
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
          <div className="max-w-xs">
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
      </section>
    </div>
  );

  if (embedded) return content;
  return <CampaignWizardPanel>{content}</CampaignWizardPanel>;
}
