"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, CalendarClock, Copy, Plus, X, Save, Loader2, CheckCircle2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary } from "@/lib/brand-ui";
import {
  WEEK_DAYS,
  defaultOrgBusinessHours,
  type OrgBusinessHours,
  type WeekDayKey,
  type TimeRange
} from "@/lib/scheduling/rules";

const DAY_LABELS: Record<WeekDayKey, string> = {
  mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves",
  fri: "Viernes", sat: "Sábado", sun: "Domingo"
};

const MIN_NOTICE_OPTIONS = [
  { value: "0", label: "Sin anticipación mínima" },
  { value: "30", label: "30 minutos" },
  { value: "60", label: "1 hora" },
  { value: "120", label: "2 horas" },
  { value: "240", label: "4 horas" },
  { value: "1440", label: "1 día" }
];

const MAX_DAYS_OPTIONS = [
  { value: "7", label: "1 semana" },
  { value: "15", label: "15 días" },
  { value: "30", label: "1 mes" },
  { value: "60", label: "2 meses" },
  { value: "90", label: "3 meses" }
];

function newRange(): TimeRange {
  return ["09:00", "18:00"];
}

export function BusinessHoursEditor() {
  const [hours, setHours] = useState<OrgBusinessHours>(defaultOrgBusinessHours());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/org/business-hours", { headers });
      const data = await res.json();
      if (res.ok && data.business_hours) setHours(data.business_hours);
    } catch {
      setError("Error de red al cargar el horario");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/org/business-hours", {
        method: "POST",
        headers,
        body: JSON.stringify({ business_hours: hours })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: WeekDayKey) {
    setHours(h => {
      const active = (h.weekly_hours[day]?.length ?? 0) > 0;
      return {
        ...h,
        weekly_hours: { ...h.weekly_hours, [day]: active ? [] : [newRange()] }
      };
    });
  }

  function updateRange(day: WeekDayKey, index: number, which: 0 | 1, value: string) {
    setHours(h => {
      const ranges = [...(h.weekly_hours[day] ?? [])];
      const range: TimeRange = [...ranges[index]] as TimeRange;
      range[which] = value;
      ranges[index] = range;
      return { ...h, weekly_hours: { ...h.weekly_hours, [day]: ranges } };
    });
  }

  function addRange(day: WeekDayKey) {
    setHours(h => ({
      ...h,
      weekly_hours: { ...h.weekly_hours, [day]: [...(h.weekly_hours[day] ?? []), newRange()] }
    }));
  }

  function removeRange(day: WeekDayKey, index: number) {
    setHours(h => ({
      ...h,
      weekly_hours: { ...h.weekly_hours, [day]: (h.weekly_hours[day] ?? []).filter((_, i) => i !== index) }
    }));
  }

  function copyMondayToWeekdays() {
    const monday = hours.weekly_hours.mon ?? [];
    setHours(h => ({
      ...h,
      weekly_hours: {
        ...h.weekly_hours,
        tue: monday.map(r => [...r] as TimeRange),
        wed: monday.map(r => [...r] as TimeRange),
        thu: monday.map(r => [...r] as TimeRange),
        fri: monday.map(r => [...r] as TimeRange)
      }
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando horario de atención...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-[#0f7eff]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Horario de atención</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-xl">
            Se configura una sola vez para toda la empresa. Cualquier agente con &quot;Agendamiento&quot; activado
            solo ofrecerá citas dentro de estos horarios, cruzados con la disponibilidad real de tu
            Google Calendar.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-white/[.08] bg-noova-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[.08] bg-white/[.02]">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Días y horarios</span>
          <button
            onClick={copyMondayToWeekdays}
            className="inline-flex items-center gap-1.5 text-[11px] text-[#0f7eff] hover:text-[#99c9ff] font-medium"
          >
            <Copy className="w-3 h-3" /> Copiar lunes a martes–viernes
          </button>
        </div>

        <div className="divide-y divide-white/[.06]">
          {WEEK_DAYS.map(day => {
            const ranges = hours.weekly_hours[day] ?? [];
            const active = ranges.length > 0;
            return (
              <div key={day} className="flex items-start gap-4 px-5 py-4">
                <label className="flex items-center gap-2.5 w-36 shrink-0 pt-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleDay(day)}
                    className="rounded border-white/20"
                  />
                  <span className={`text-sm font-medium ${active ? "text-white" : "text-gray-500"}`}>
                    {DAY_LABELS[day]}
                  </span>
                </label>

                {active ? (
                  <div className="flex-1 flex flex-col gap-2">
                    {ranges.map((range, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <input
                          type="time"
                          value={range[0]}
                          onChange={e => updateRange(day, i, 0, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#0d0e14] border border-white/[.12] text-xs text-white"
                        />
                        <span className="text-gray-500 text-xs">a</span>
                        <input
                          type="time"
                          value={range[1]}
                          onChange={e => updateRange(day, i, 1, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#0d0e14] border border-white/[.12] text-xs text-white"
                        />
                        {ranges.length > 1 && (
                          <button
                            onClick={() => removeRange(day, i)}
                            className="p-1 text-gray-500 hover:text-red-400"
                            title="Quitar franja"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {i === ranges.length - 1 && (
                          <button
                            onClick={() => addRange(day)}
                            className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-white ml-1"
                            title="Agregar otra franja (ej. jornada partida)"
                          >
                            <Plus className="w-3 h-3" /> Franja
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="flex-1 text-xs text-gray-600 pt-2">Cerrado</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Anticipación mínima
          </label>
          <NoovaSelect
            value={String(hours.min_notice_min)}
            onChange={v => setHours(h => ({ ...h, min_notice_min: parseInt(v, 10) }))}
            allowEmpty={false}
            options={MIN_NOTICE_OPTIONS}
          />
          <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
            No se ofrecerán citas con menos anticipación que esta.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
            Ventana hacia el futuro
          </label>
          <NoovaSelect
            value={String(hours.max_days_ahead)}
            onChange={v => setHours(h => ({ ...h, max_days_ahead: parseInt(v, 10) }))}
            allowEmpty={false}
            options={MAX_DAYS_OPTIONS}
          />
          <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
            Qué tan lejos en el futuro se pueden agendar citas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={handleSave} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar horario"}
        </button>
      </div>
    </div>
  );
}
