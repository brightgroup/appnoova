"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Send, Settings2, Phone } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, btnFilterGroup, btnFilterActive, btnFilterIdle, registryTableEmpty, textMuted } from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Switch } from "@/components/ui/Switch";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { InfoBox } from "@/components/ui/InfoBox";
import { Badge } from "@/components/ui/Badge";
import { useModuleWriteAccess } from "@/components/layout/DashboardRouteGuard";
import type { PolizaRecord } from "@/lib/insurers/polizas-db";
import type { RenovacionAvisoRecord } from "@/lib/insurers/renovacion-avisos-db";
import type { RenovacionRule } from "@/lib/insurers/renovacion-rules-db";

interface Contacto { id: string; name: string; telefono: string | null; whatsapp: string | null; }
interface Proxima { poliza: PolizaRecord; contacto: Contacto | null; avisos: RenovacionAvisoRecord[]; }
interface WhatsAppChannelOption { id: string; e164: string; friendly_name: string | null; }
interface TemplateOption { id: string; template_name: string; status: string; whatsapp_channel_id: string; }

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));
const DIAS_PRESET = [30, 15, 5];

function diasRestantes(vigenciaHasta: string | null): number | null {
  if (!vigenciaHasta) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${vigenciaHasta}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000);
}

export default function RenovacionesPage() {
  const { canWrite: canManage } = useModuleWriteAccess("seguros", "manage");

  const [proximas, setProximas] = useState<Proxima[]>([]);
  const [loading, setLoading] = useState(true);
  const [ventana, setVentana] = useState<30 | 60 | 90>(60);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [rule, setRule] = useState<RenovacionRule | null>(null);
  const [channels, setChannels] = useState<WhatsAppChannelOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const [proxRes, reglaRes, chanRes] = await Promise.all([
      fetch(`/api/seguros/renovaciones?dias=${ventana}`, { headers }),
      fetch("/api/seguros/renovaciones/reglas", { headers }),
      fetch("/api/whatsapp/channels", { headers })
    ]);
    if (proxRes.ok) setProximas((await proxRes.json()).proximas ?? []);
    if (reglaRes.ok) setRule((await reglaRes.json()).rule);
    if (chanRes.ok) setChannels((await chanRes.json()).channels ?? []);
    if (!silent) setLoading(false);
  }, [ventana]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!rule?.whatsappChannelId) { setTemplates([]); return; }
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp/templates?whatsapp_channel_id=${rule.whatsappChannelId}`, { headers });
      if (res.ok) setTemplates(((await res.json()).templates ?? []).filter((t: TemplateOption) => ["approved", "active"].includes(t.status)));
    })();
  }, [rule?.whatsappChannelId]);

  async function saveRule(patch: Record<string, unknown>) {
    setSaving(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/seguros/renovaciones/reglas", { method: "PUT", headers, body: JSON.stringify(patch) });
    const json = await res.json();
    setSaving(false);
    if (res.ok) setRule(json.rule);
  }

  async function enviarAhora(polizaId: string, diasAviso: number) {
    setSendingId(`${polizaId}-${diasAviso}`);
    setListError(null);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/renovaciones/${polizaId}/enviar`, {
      method: "POST",
      headers,
      body: JSON.stringify({ dias_aviso: diasAviso })
    });
    const json = await res.json();
    setSendingId(null);
    if (!res.ok) {
      setListError(json.error ?? "No se pudo enviar");
      return;
    }
    void load(true);
  }

  const ready = Boolean(rule?.whatsappChannelId && rule?.templateId);

  const sorted = useMemo(
    () => [...proximas].sort((a, b) => (a.poliza.vigenciaHasta ?? "").localeCompare(b.poliza.vigenciaHasta ?? "")),
    [proximas]
  );

  return (
    <ChannelListPage
      title="Renovaciones"
      description="Próximas pólizas a vencer y la cadencia de WhatsApp que las recuerda automáticamente."
      loading={loading}
      onRefresh={() => load()}
      refreshing={loading}
      error={listError || undefined}
      filters={
        <div className={btnFilterGroup}>
          {([30, 60, 90] as const).map(d => (
            <button key={d} type="button" onClick={() => setVentana(d)} className={ventana === d ? btnFilterActive : btnFilterIdle}>
              {d} días
            </button>
          ))}
        </div>
      }
    >
      {!ready && canManage && (
        <InfoBox variant="warning" icon={Settings2} layout="row" className="mb-4">
          La cadencia está apagada: elige el canal y la plantilla de WhatsApp abajo para activarla.
        </InfoBox>
      )}

      {sorted.length === 0 ? (
        <div className={registryTableEmpty}>Ninguna póliza activa vence en los próximos {ventana} días.</div>
      ) : (
        <div className="space-y-2 mb-8">
          {sorted.map(({ poliza, contacto, avisos }) => {
            const dias = diasRestantes(poliza.vigenciaHasta);
            const avisosPorHito = new Map(avisos.map(a => [a.diasAviso, a]));
            return (
              <div key={poliza.id} className="rounded-xl border border-white/[.08] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-white">{contacto?.name ?? "Sin contacto"}</p>
                    <p className="text-xs text-gray-500">
                      {poliza.ramo} · {poliza.aseguradora} {poliza.numeroPoliza ? `· ${poliza.numeroPoliza}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-200">{poliza.vigenciaHasta}</p>
                    <p className={`text-xs ${dias !== null && dias <= 5 ? "text-amber-300" : "text-gray-500"}`}>
                      {dias !== null ? (dias < 0 ? `Venció hace ${Math.abs(dias)}d` : `Faltan ${dias}d`) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {(rule?.diasAviso ?? DIAS_PRESET).map(d => {
                    const aviso = avisosPorHito.get(d);
                    const key = `${poliza.id}-${d}`;
                    return aviso ? (
                      <Badge
                        key={key}
                        variant={aviso.estado === "enviado" ? (aviso.respondioAt ? "emerald" : "sky") : "neutral"}
                      >
                        {d}d · {aviso.estado === "enviado" ? (aviso.respondioAt ? "respondió" : "enviado") : aviso.estado}
                      </Badge>
                    ) : canManage ? (
                      <button
                        key={key}
                        type="button"
                        disabled={!ready || sendingId === key}
                        onClick={() => enviarAhora(poliza.id, d)}
                        className={`${btnGhost} !text-xs !py-1 !px-2.5`}
                      >
                        <Send className="w-3 h-3" /> {sendingId === key ? "Enviando…" : `Enviar aviso ${d}d`}
                      </button>
                    ) : null;
                  })}
                  {avisosPorHito.get(0) && (
                    <Badge variant="violet">
                      <Phone className="w-3 h-3 mr-1 inline" /> Llamada {avisosPorHito.get(0)!.estado}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-6 max-w-2xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-[#0f7eff]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Cadencia de recordatorios</h2>
              <p className={`text-xs ${textMuted} mt-1 leading-relaxed max-w-lg`}>
                Cuándo, por qué canal y con qué plantilla se avisa a cada cliente antes de que su póliza venza.
              </p>
            </div>
          </div>

          {rule && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-200">Activar cadencia</span>
                <Switch checked={rule.enabled} onChange={enabled => saveRule({ enabled })} disabled={saving} />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Canal de WhatsApp</label>
                <NoovaSelect
                  value={rule.whatsappChannelId ?? ""}
                  onChange={v => saveRule({ whatsapp_channel_id: v || null, template_id: null })}
                  options={channels.map(c => ({ value: c.id, label: c.friendly_name || c.e164 }))}
                  allowEmpty
                  emptyLabel="Sin elegir"
                  disabled={saving}
                />
              </div>

              {rule.whatsappChannelId && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Plantilla aprobada</label>
                  <NoovaSelect
                    value={rule.templateId ?? ""}
                    onChange={v => saveRule({ template_id: v || null })}
                    options={templates.map(t => ({ value: t.id, label: t.template_name }))}
                    allowEmpty
                    emptyLabel={templates.length === 0 ? "Sin plantillas aprobadas — crea 'Recordatorio de renovación'" : "Sin elegir"}
                    disabled={saving}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Hora de envío (Bogotá)</label>
                <NoovaSelect
                  value={String(rule.horaEnvio)}
                  onChange={v => saveRule({ hora_envio: Number(v) })}
                  options={HOUR_OPTIONS}
                  allowEmpty={false}
                  disabled={saving}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-200">
                  Escalar a llamada de voz si no responde
                  <span className="block text-xs text-gray-500">Después del último aviso (día {Math.min(...rule.diasAviso)}), sin respuesta.</span>
                </span>
                <Switch checked={rule.escalarALlamada} onChange={escalar_a_llamada => saveRule({ escalar_a_llamada })} disabled={saving} />
              </div>
            </div>
          )}
        </div>
      )}
    </ChannelListPage>
  );
}
