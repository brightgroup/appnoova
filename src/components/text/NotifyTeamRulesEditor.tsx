"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Mail, Smartphone, MessageCircle, Info, ExternalLink } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { InfoBox } from "@/components/ui/InfoBox";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import {
  defaultNotifyTeamRules,
  NOTIFY_TEAM_EVENT_META,
  NOTIFY_TEAM_EVENTS,
  type NotifyTeamEvent,
  type NotifyTeamRules
} from "@/lib/text-notify-rules";
import type { WhatsAppTemplateRecord } from "@/types/whatsapp-template";

interface NotifyTeamRulesEditorProps {
  value: NotifyTeamRules | undefined;
  onChange: (next: NotifyTeamRules) => void;
}

export function NotifyTeamRulesEditor({ value, onChange }: NotifyTeamRulesEditorProps) {
  const rules = { ...defaultNotifyTeamRules(), ...(value ?? {}) };
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/whatsapp/templates", { headers });
        const data = await res.json();
        if (!cancelled && res.ok) setTemplates(data.templates ?? []);
      } catch {
        /* opcional */
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Solo plantillas aprobadas y de una sola variable — ahí va el mensaje completo ya armado.
  const eligibleTemplates = templates.filter(
    t => t.status === "approved" && t.variable_labels.length === 1
  );
  const hasEligibleTemplates = !loadingTemplates && eligibleTemplates.length > 0;

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
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#5b5bf6]/15 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-[#5b5bf6]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Notificaciones al equipo</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-lg">
            Recibe un aviso automático apenas ocurra alguno de estos eventos importantes. Activa el canal
            por el que quieres enterarte.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {NOTIFY_TEAM_EVENTS.map(event => {
          const rule = rules[event]!;
          const meta = NOTIFY_TEAM_EVENT_META[event];
          return (
            <div
              key={event}
              className="rounded-2xl border border-white/[.08] bg-noova-surface overflow-hidden"
            >
              <label className="flex items-start gap-3 p-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={e => patch(event, { enabled: e.target.checked })}
                  className="mt-0.5 rounded border-white/20 w-4 h-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-100">{meta.label}</span>
                  <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">
                    {meta.description}
                  </span>
                </span>
              </label>

              {rule.enabled && (
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/[.06]">
                  <div className="flex flex-wrap gap-3 pt-4">
                    <ChannelToggle
                      icon={Mail}
                      label="Email (inbox)"
                      checked={rule.email}
                      onChange={v => patch(event, { email: v })}
                    />
                    <ChannelToggle
                      icon={Smartphone}
                      label="Push"
                      checked={rule.push}
                      onChange={v => patch(event, { push: v })}
                    />
                    <ChannelToggle
                      icon={MessageCircle}
                      label="WhatsApp"
                      checked={rule.whatsapp}
                      disabled={!hasEligibleTemplates}
                      title={
                        hasEligibleTemplates
                          ? undefined
                          : "Necesitas una plantilla de WhatsApp aprobada para activar este canal"
                      }
                      onChange={v => patch(event, { whatsapp: v })}
                    />
                  </div>

                  {!hasEligibleTemplates && (
                    <InfoBox icon={Info} layout="row" variant="neutral">
                      Para notificar por WhatsApp necesitas una plantilla aprobada por Meta (de una sola
                      variable) — así evitamos que el mensaje se bloquee por spam.{" "}
                      <Link
                        href="/dashboard/canales/whatsapp/plantillas/nueva"
                        className="underline inline-flex items-center gap-1 font-medium text-gray-300"
                      >
                        Crear plantilla <ExternalLink className="w-3 h-3" />
                      </Link>
                    </InfoBox>
                  )}

                  {rule.whatsapp && hasEligibleTemplates && (
                    <div className="rounded-xl bg-white/[.03] border border-white/[.06] p-4 space-y-4">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
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
                        {rule.whatsapp_destinations.length === 0 && (
                          <p className="text-[10px] text-red-400 mt-1.5">
                            Agrega al menos un número — sin esto, el aviso no se envía por WhatsApp.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                          Plantilla de WhatsApp
                        </label>
                        <NoovaSelect
                          value={rule.whatsapp_template_id ?? ""}
                          onChange={v => patch(event, { whatsapp_template_id: v || null })}
                          allowEmpty={true}
                          emptyLabel="Selecciona una plantilla"
                          options={eligibleTemplates.map(t => ({
                            value: t.id,
                            label: t.template_name
                          }))}
                        />
                        {rule.whatsapp_template_id ? (
                          <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                            Se envía como plantilla aprobada por Meta — llega a cualquier número, sin
                            depender de una conversación abierta.
                          </p>
                        ) : (
                          <p className="text-[10px] text-red-400 mt-1.5">
                            Sin plantilla seleccionada, el aviso no se enviará por WhatsApp.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelToggle({
  icon: Icon,
  label,
  checked,
  disabled,
  title,
  onChange
}: {
  icon: React.ElementType;
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (v: boolean) => void;
}) {
  const active = checked && !disabled;
  return (
    <label
      title={title}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-colors text-xs font-medium ${
        disabled
          ? "bg-white/[.01] border-white/[.06] text-gray-600 cursor-not-allowed"
          : active
            ? "bg-[#5b5bf6]/15 border-[#5b5bf6]/40 text-white cursor-pointer"
            : "bg-white/[.02] border-white/[.10] text-gray-400 hover:text-gray-200 cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="hidden"
      />
      <Icon className="w-3.5 h-3.5" />
      {label}
    </label>
  );
}
