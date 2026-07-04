"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PhoneOutgoing,
  Clock,
  Save,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { adminRegistryPage, adminRegistryContent, btnPrimary } from "@/lib/brand-ui";

interface CallRules {
  tick_minutes: number;
  batch_size: number;
  max_concurrent: number;
  retry_gap_minutes: number;
  ring_timeout_seconds: number;
  enabled: boolean;
}

interface SpecialEvent {
  date: string;
  label: string;
}

interface TimePayload {
  rules: { extra_events: SpecialEvent[]; extra_notes: string[] };
  live: {
    fecha_hora_colombia: string;
    dia_semana_colombia: string;
    es_festivo_colombia: string;
    calendario_colombia: string;
    notas_calendario_colombia: string;
    prompt_block: string;
  };
  code_holidays: Record<string, string[]>;
  code_special_events: SpecialEvent[];
  timezone: string;
}

const TABS = [
  { id: "reglas", label: "Reglas de llamadas", icon: PhoneOutgoing },
  { id: "tiempo", label: "Calendario y hora", icon: Clock },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "w-32 rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white text-right tabular-nums focus:outline-none focus:border-[#5b5bf6]/50";
const cardCls = "rounded-xl border border-white/[.08] bg-white/[.02] p-4";
const labelCls = "text-sm font-medium text-white";
const hintCls = "text-xs text-gray-500";

export default function MotorLlamadasPage() {
  const [tab, setTab] = useState<TabId>("reglas");
  const [rules, setRules] = useState<CallRules | null>(null);
  const [time, setTime] = useState<TimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [savedRules, setSavedRules] = useState(false);
  const [savedTime, setSavedTime] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [rulesRes, timeRes] = await Promise.all([
      authFetch("/api/admin/call-rules"),
      authFetch("/api/admin/time-rules"),
    ]);
    const rulesJson = await rulesRes.json();
    const timeJson = await timeRes.json();
    if (rulesRes.ok) setRules(rulesJson.rules);
    if (timeRes.ok) setTime(timeJson);
    if (!rulesRes.ok || !timeRes.ok) setError("No se pudo cargar la configuración.");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRule = (patch: Partial<CallRules>) => {
    setRules(prev => (prev ? { ...prev, ...patch } : prev));
    setSavedRules(false);
  };

  const runDialerTick = async () => {
    setTicking(true);
    setTickResult(null);
    setError("");
    const res = await authFetch("/api/cron/campaign-dialer", { method: "POST" });
    const json = await res.json();
    setTicking(false);
    if (!res.ok) {
      setError(json.error ?? "Error al ejecutar el marcador");
      return;
    }
    if (json.skipped === "motor_disabled") {
      setTickResult("Motor apagado — no se colocaron llamadas.");
      return;
    }
    if (json.skipped === "max_concurrent") {
      setTickResult(`Límite de simultáneas alcanzado (${json.active_calls} en curso).`);
      return;
    }
    const errCount = Array.isArray(json.errors) ? json.errors.length : 0;
    setTickResult(
      `Ciclo completado: ${json.placed ?? 0} llamada(s) colocada(s), ${json.active_calls ?? 0} en curso${errCount ? `, ${errCount} error(es)` : ""}.`
    );
  };

  const saveRules = async () => {
    if (!rules) return;
    setSavingRules(true);
    setError("");
    const res = await authFetch("/api/admin/call-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    const json = await res.json();
    setSavingRules(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    setRules(json.rules);
    setSavedRules(true);
  };

  const saveTime = async () => {
    if (!time) return;
    setSavingTime(true);
    setError("");
    const res = await authFetch("/api/admin/time-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(time.rules),
    });
    const json = await res.json();
    setSavingTime(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    setTime(json);
    setSavedTime(true);
  };

  const numberField = (
    label: string,
    hint: string,
    key: keyof CallRules,
    unit: string
  ) => (
    <div className={`${cardCls} flex items-center justify-between gap-4`}>
      <div className="min-w-0">
        <p className={labelCls}>{label}</p>
        <p className={hintCls}>{hint}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          value={rules ? Number(rules[key]) : 0}
          onChange={e => patchRule({ [key]: Number(e.target.value) } as Partial<CallRules>)}
          className={inputCls}
        />
        <span className="text-xs text-gray-500 w-16">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={PhoneOutgoing}
        title="Motor de llamadas"
        subtitle="Reglas globales del marcador de campañas y contexto temporal de la IA."
        onRefresh={load}
        refreshing={loading}
      />

      <div className={adminRegistryContent}>
        <div className="flex gap-1 border-b border-white/[.08] mb-6">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-[#5b5bf6] text-white"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : tab === "reglas" ? (
          <div className="max-w-2xl space-y-4">
            <div className={`${cardCls} flex items-center justify-between gap-4`}>
              <div>
                <p className={labelCls}>Motor activo</p>
                <p className={hintCls}>
                  Enciende o apaga globalmente el marcador automático de campañas. Con el motor
                  activo, el servidor ejecuta ciclos automáticos según la frecuencia configurada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => patchRule({ enabled: !rules?.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  rules?.enabled ? "bg-[#5b5bf6]" : "bg-white/[.15]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    rules?.enabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            {numberField(
              "Frecuencia del marcador",
              "Cada cuántos minutos el motor revisa y coloca llamadas.",
              "tick_minutes",
              "minutos"
            )}
            {numberField(
              "Tamaño de lote",
              "Cuántas llamadas se colocan por cada ciclo del marcador.",
              "batch_size",
              "llamadas"
            )}
            {numberField(
              "Llamadas simultáneas",
              "Máximo de llamadas en curso al mismo tiempo.",
              "max_concurrent",
              "en curso"
            )}
            {numberField(
              "Espera entre reintentos",
              "Minutos antes de reintentar un contacto no contestado.",
              "retry_gap_minutes",
              "minutos"
            )}
            {numberField(
              "Timeout de timbrado",
              "Segundos que suena antes de colgar por no contestar.",
              "ring_timeout_seconds",
              "segundos"
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => void runDialerTick()}
                disabled={ticking || !rules?.enabled}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.04] px-4 py-2 text-sm text-white hover:bg-white/[.08] disabled:opacity-50"
              >
                {ticking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PhoneOutgoing className="w-4 h-4" />
                )}
                {ticking ? "Ejecutando ciclo…" : "Ejecutar ciclo ahora"}
              </button>
              <button
                type="button"
                onClick={() => void saveRules()}
                disabled={savingRules || savedRules}
                className={`${btnPrimary} gap-2`}
              >
                {savingRules ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : savedRules ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {savingRules ? "Guardando…" : savedRules ? "Guardado" : "Guardar reglas"}
              </button>
            </div>
            {tickResult && (
              <p className="text-xs text-emerald-400/90">{tickResult}</p>
            )}
            <p className="text-xs text-gray-500">
              En producción el marcador corre solo al activar una campaña y cada{" "}
              {rules?.tick_minutes ?? "—"} min mientras el motor esté encendido. El botón anterior
              fuerza un ciclo manual de prueba.
            </p>
          </div>
        ) : (
          time && (
            <div className="max-w-3xl space-y-6">
              {/* Estado actual en vivo */}
              <div className={cardCls}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-[#5b5bf6]" />
                  <h3 className="text-sm font-semibold text-white">Hora y fecha actuales (lo que ve la IA)</h3>
                </div>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className={hintCls}>Fecha y hora</dt>
                    <dd className="text-white">{time.live.fecha_hora_colombia}</dd>
                  </div>
                  <div>
                    <dt className={hintCls}>Día</dt>
                    <dd className="text-white capitalize">{time.live.dia_semana_colombia}</dd>
                  </div>
                  <div>
                    <dt className={hintCls}>¿Festivo hoy?</dt>
                    <dd className="text-white">{time.live.es_festivo_colombia}</dd>
                  </div>
                  <div>
                    <dt className={hintCls}>Zona horaria</dt>
                    <dd className="text-white">{time.timezone}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className={hintCls}>Calendario</dt>
                    <dd className="text-white">{time.live.calendario_colombia}</dd>
                  </div>
                </dl>
              </div>

              {/* Notas editables */}
              <div className={cardCls}>
                <p className={labelCls}>Notas del contexto temporal</p>
                <p className={`${hintCls} mb-2`}>
                  Una por línea. Se inyectan a la IA (ej. jornadas especiales, atención reducida).
                </p>
                <textarea
                  value={time.rules.extra_notes.join("\n")}
                  onChange={e => {
                    const extra_notes = e.target.value.split("\n");
                    setTime(prev => (prev ? { ...prev, rules: { ...prev.rules, extra_notes } } : prev));
                    setSavedTime(false);
                  }}
                  rows={3}
                  className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                  placeholder="Ej. Hoy atención reducida por capacitación interna"
                />
              </div>

              {/* Eventos especiales editables */}
              <div className={cardCls}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className={labelCls}>Eventos especiales</p>
                    <p className={hintCls}>Fechas puntuales que la IA debe tratar como no laborables/relevantes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTime(prev =>
                        prev
                          ? {
                              ...prev,
                              rules: {
                                ...prev.rules,
                                extra_events: [...prev.rules.extra_events, { date: "", label: "" }],
                              },
                            }
                          : prev
                      );
                      setSavedTime(false);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.10] bg-white/[.04] px-2.5 py-1.5 text-xs text-white hover:bg-white/[.08]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {time.rules.extra_events.length === 0 && (
                    <p className={hintCls}>Sin eventos especiales configurados.</p>
                  )}
                  {time.rules.extra_events.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={ev.date}
                        onChange={e => {
                          const extra_events = [...time.rules.extra_events];
                          extra_events[i] = { ...extra_events[i], date: e.target.value };
                          setTime(prev => (prev ? { ...prev, rules: { ...prev.rules, extra_events } } : prev));
                          setSavedTime(false);
                        }}
                        className="rounded-lg border border-white/[.12] bg-white/[.04] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                      />
                      <input
                        value={ev.label}
                        onChange={e => {
                          const extra_events = [...time.rules.extra_events];
                          extra_events[i] = { ...extra_events[i], label: e.target.value };
                          setTime(prev => (prev ? { ...prev, rules: { ...prev.rules, extra_events } } : prev));
                          setSavedTime(false);
                        }}
                        placeholder="Descripción"
                        className="flex-1 rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#5b5bf6]/50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const extra_events = time.rules.extra_events.filter((_, x) => x !== i);
                          setTime(prev => (prev ? { ...prev, rules: { ...prev.rules, extra_events } } : prev));
                          setSavedTime(false);
                        }}
                        className="p-1.5 text-gray-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => void saveTime()}
                    disabled={savingTime || savedTime}
                    className={`${btnPrimary} gap-2`}
                  >
                    {savingTime ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : savedTime ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {savingTime ? "Guardando…" : savedTime ? "Guardado" : "Guardar calendario"}
                  </button>
                </div>
              </div>

              {/* Festivos en código (solo lectura) */}
              <div className={cardCls}>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays className="w-4 h-4 text-[#5b5bf6]" />
                  <h3 className="text-sm font-semibold text-white">Festivos por año (definidos en código)</h3>
                </div>
                <p className={`${hintCls} mb-3`}>
                  Fuente: <code className="text-gray-400">src/lib/colombia-calendar.ts</code>. Para
                  cambiar años o reglas de Ley Emiliani, edita ese archivo.
                </p>
                <div className="space-y-2">
                  {Object.entries(time.code_holidays).map(([year, days]) => (
                    <div key={year} className="flex gap-3 text-xs">
                      <span className="text-white font-semibold w-12 shrink-0">{year}</span>
                      <span className="text-gray-400">{days.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bloque de prompt (solo lectura) */}
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-white mb-2">
                  Bloque temporal inyectado a la IA
                </h3>
                <p className={`${hintCls} mb-3`}>
                  Texto exacto que reciben Ori y los agentes en cada interacción.
                </p>
                <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed bg-black/20 rounded-lg p-3 overflow-x-auto">
                  {time.live.prompt_block}
                </pre>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
