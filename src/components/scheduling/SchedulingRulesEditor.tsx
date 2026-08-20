"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Info, Video } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { InfoBox } from "@/components/ui/InfoBox";
import { defaultSchedulingRules, type SchedulingRules } from "@/lib/scheduling/rules";

const DURATION_PRESETS = [15, 30, 45, 60, 90];
const BUFFER_PRESETS = [0, 5, 10, 15, 30];

interface CalendarConnectionStatus {
  configured: boolean;
  connection: { id: string; googleEmail: string | null; status: string } | null;
}

interface SchedulingRulesEditorProps {
  value: SchedulingRules | undefined;
  onChange: (next: SchedulingRules) => void;
}

export function SchedulingRulesEditor({ value, onChange }: SchedulingRulesEditorProps) {
  const rules = { ...defaultSchedulingRules(), ...(value ?? {}) };
  const [status, setStatus] = useState<CalendarConnectionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/conectores/google-calendar/status", { headers });
        const data = await res.json();
        if (!cancelled && res.ok) setStatus(data);
      } catch {
        /* opcional */
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(partial: Partial<SchedulingRules>) {
    onChange({ ...rules, ...partial });
  }

  const hasConnection = Boolean(status?.connection);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-[#0f7eff]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Agendamiento de citas</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-lg">
            Tu agente ofrecerá horarios realmente disponibles y agendará la cita en tu calendario,
            todo dentro de la misma conversación con el cliente.
          </p>
        </div>
      </div>

      {!loadingStatus && !hasConnection && (
        <InfoBox icon={Info} layout="row" variant="neutral">
          Primero conecta Google Calendar en{" "}
          <Link href="/dashboard/conectores/google-calendar" className="underline inline-flex items-center gap-1 font-medium text-gray-300">
            Conectores <ExternalLink className="w-3 h-3" />
          </Link>{" "}
          — sin eso, esta tool no queda disponible aunque la actives aquí.
        </InfoBox>
      )}

      <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules.enabled}
            onChange={e => patch({ enabled: e.target.checked })}
            className="mt-0.5 rounded border-white/20 w-4 h-4"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-100">Este agente puede agendar citas</span>
            <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">
              Usa el horario de atención de la empresa y ofrece solo horarios realmente disponibles.
            </span>
          </span>
        </label>

        {rules.enabled && (
          <div className="mt-5 pt-5 border-t border-white/[.08] space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <MinutesField
                label="Duración de la cita"
                value={rules.event_duration_min}
                min={5}
                max={240}
                presets={DURATION_PRESETS}
                onChange={v => patch({ event_duration_min: v })}
              />
              <MinutesField
                label="Descanso entre citas"
                value={rules.buffer_min}
                min={0}
                max={120}
                presets={BUFFER_PRESETS}
                zeroLabel="Sin descanso"
                onChange={v => patch({ buffer_min: v })}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer rounded-xl bg-white/[.03] border border-white/[.06] px-4 py-3">
              <input
                type="checkbox"
                checked={rules.create_meet_link}
                onChange={e => patch({ create_meet_link: e.target.checked })}
                className="mt-0.5 rounded border-white/20 w-4 h-4"
              />
              <span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
                  <Video className="w-3.5 h-3.5 text-[#0f7eff]" /> Crear como reunión de Google Meet
                </span>
                <span className="block text-[11px] text-gray-500 leading-relaxed mt-0.5">
                  En vez de un evento simple, cada cita se crea con un enlace de videollamada que se le
                  comparte al cliente. Útil si atiendes citas de forma virtual.
                </span>
              </span>
            </label>

            <div className="flex items-center justify-between rounded-xl bg-white/[.03] border border-white/[.06] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-gray-300">Horario de atención</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Compartido por todos los agentes de tu empresa.</p>
              </div>
              <Link
                href="/dashboard/configuracion"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0f7eff] hover:text-[#99c9ff] shrink-0"
              >
                Editar en Configuración <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {loadingStatus ? (
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Verificando conector de calendario…
              </p>
            ) : hasConnection ? (
              <p className="text-[11px] text-emerald-400/80 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Calendario conectado: {status?.connection?.googleEmail || "cuenta de Google"}.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** Select de presets + campo numérico libre — para cuando ningún preset calza (ej. 20 min, 120 min). */
function MinutesField({
  label,
  value,
  min,
  max,
  presets,
  zeroLabel,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  presets: number[];
  zeroLabel?: string;
  onChange: (v: number) => void;
}) {
  function clamp(n: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={5}
          onChange={e => onChange(clamp(parseInt(e.target.value, 10)))}
          className="w-full px-3 py-2.5 rounded-xl bg-noova-surface border border-white/[.08] text-sm text-white focus:outline-none focus:border-[#0f7eff]/40 pr-12"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">min</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
              value === p
                ? "bg-[#0f7eff]/20 border-[#0f7eff]/40 text-white"
                : "bg-white/[.02] border-white/[.08] text-gray-500 hover:text-gray-300"
            }`}
          >
            {p === 0 && zeroLabel ? zeroLabel : `${p} min`}
          </button>
        ))}
      </div>
    </div>
  );
}
