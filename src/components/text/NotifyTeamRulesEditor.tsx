"use client";

import {
  defaultNotifyTeamRules,
  NOTIFY_TEAM_EVENT_META,
  NOTIFY_TEAM_EVENTS,
  type NotifyTeamEvent,
  type NotifyTeamRules
} from "@/lib/text-notify-rules";

interface NotifyTeamRulesEditorProps {
  value: NotifyTeamRules | undefined;
  onChange: (next: NotifyTeamRules) => void;
}

export function NotifyTeamRulesEditor({ value, onChange }: NotifyTeamRulesEditorProps) {
  const rules = { ...defaultNotifyTeamRules(), ...(value ?? {}) };

  function patch(event: NotifyTeamEvent, partial: Partial<(typeof rules)[NotifyTeamEvent]>) {
    onChange({
      ...rules,
      [event]: {
        ...rules[event]!,
        ...partial
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-200">Notificaciones al equipo</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          La IA llama la herramienta <code className="text-gray-400">notify_team</code> cuando detecta
          estos eventos. Activa el canal y, si usas WhatsApp, indica los números del equipo (E.164).
        </p>
      </div>

      {NOTIFY_TEAM_EVENTS.map(event => {
        const rule = rules[event]!;
        const meta = NOTIFY_TEAM_EVENT_META[event];
        return (
          <div
            key={event}
            className="rounded-xl border border-white/[.08] bg-[#0d0e14]/60 p-3 space-y-2.5"
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => patch(event, { enabled: e.target.checked })}
                className="mt-0.5 rounded border-white/20"
              />
              <span>
                <span className="block text-xs font-semibold text-gray-200">{meta.label}</span>
                <span className="block text-[10px] text-gray-500 leading-relaxed mt-0.5">
                  {meta.description}
                </span>
              </span>
            </label>

            {rule.enabled && (
              <div className="pl-6 space-y-2">
                <div className="flex flex-wrap gap-3 text-[11px] text-gray-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.email}
                      onChange={e => patch(event, { email: e.target.checked })}
                      className="rounded border-white/20"
                    />
                    Email (inbox)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.push}
                      onChange={e => patch(event, { push: e.target.checked })}
                      className="rounded border-white/20"
                    />
                    Push
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.whatsapp}
                      onChange={e => patch(event, { whatsapp: e.target.checked })}
                      className="rounded border-white/20"
                    />
                    WhatsApp
                  </label>
                </div>

                {rule.whatsapp && (
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">
                      Destinos WhatsApp (uno por línea, formato +57…)
                    </label>
                    <textarea
                      value={rule.whatsapp_destinations.join("\n")}
                      onChange={e =>
                        patch(event, {
                          whatsapp_destinations: e.target.value
                            .split(/[\n,;]+/)
                            .map(s => s.trim())
                            .filter(Boolean)
                        })
                      }
                      rows={2}
                      placeholder={"+573001112233"}
                      className="w-full px-3 py-2 rounded-lg bg-[#0d0e14] border border-white/[.12] text-xs text-white placeholder:text-gray-600 resize-none"
                    />
                    <p className="text-[10px] text-amber-400/80 mt-1 leading-relaxed">
                      Se envía desde la línea WhatsApp activa de la org. Si el destino no tiene ventana
                      de 24h abierta, Meta puede rechazar el mensaje (luego soportaremos plantillas).
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
