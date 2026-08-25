"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Bell, Bot, Mail, Info, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  btnFilterGroup, btnFilterActive, btnFilterIdle,
  registryPage, registryToolbar, registryContent, registryPanel, textMuted
} from "@/lib/brand-ui";
import { Switch } from "@/components/ui/Switch";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { InfoBox } from "@/components/ui/InfoBox";
import type { InventoryAlertMode, InventoryAlertRule } from "@/types/erp";

type Tab = "alertas" | "ori";

const MODE_OPTIONS: { value: InventoryAlertMode; label: string }[] = [
  { value: "al_cruzar", label: "Al momento en que un producto llega a su mínimo" },
  { value: "resumen_diario", label: "Resumen diario a una hora fija" },
  { value: "ambos", label: "Ambos" }
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`
}));

export default function ErpInventoryRulesPage() {
  const [tab, setTab] = useState<Tab>("alertas");

  const [rule, setRule] = useState<InventoryAlertRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinatariosText, setDestinatariosText] = useState("");

  const [oriEnabled, setOriEnabled] = useState(false);
  const [oriSaving, setOriSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [reglasRes, oriRes] = await Promise.all([
      authFetch("/api/erp/inventario/reglas"),
      authFetch("/api/erp/inventario/ori")
    ]);
    if (reglasRes.ok) {
      const json = await reglasRes.json();
      setRule(json.rule);
      setDestinatariosText((json.rule?.destinatarios ?? []).join(", "));
    }
    if (oriRes.ok) {
      const json = await oriRes.json();
      setOriEnabled(json.enabled === true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(patch: Partial<{ enabled: boolean; canal_email: boolean; modo: InventoryAlertMode; hora_resumen: number; destinatarios: string[] }>) {
    setSaving(true);
    setError(null);
    const res = await authFetch("/api/erp/inventario/reglas", { method: "PUT", body: JSON.stringify(patch) });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Error al guardar");
      return;
    }
    setRule(json.rule);
  }

  async function saveOriAccess(enabled: boolean) {
    setOriSaving(true);
    const res = await authFetch("/api/erp/inventario/ori", { method: "PUT", body: JSON.stringify({ enabled }) });
    if (res.ok) setOriEnabled(enabled);
    setOriSaving(false);
  }

  const noRecipients = rule ? rule.destinatarios.length === 0 : false;

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/erp/inventario" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Configuración de Inventario</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>Alertas de stock mínimo y acceso de ORI a este inventario.</p>
          </div>
        </div>
        <div className={`${btnFilterGroup} mt-4`}>
          <button type="button" onClick={() => setTab("alertas")} className={tab === "alertas" ? btnFilterActive : btnFilterIdle}>
            Alertas
          </button>
          <button type="button" onClick={() => setTab("ori")} className={tab === "ori" ? btnFilterActive : btnFilterIdle}>
            ORI
          </button>
        </div>
      </div>

      <div className={registryContent}>
        <div className={`${registryPanel} max-w-2xl`}>
          {loading ? (
            <div className="flex justify-center py-16 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <>
              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{error}</p>
              )}

              {tab === "alertas" && rule && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
                      <Bell className="w-5 h-5 text-[#0f7eff]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-gray-100">Alertas de stock mínimo</h2>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-lg">
                        Cuándo y a quién avisar por correo cuando un producto llega a su mínimo o por debajo.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[.08] bg-noova-surface overflow-hidden">
                    <label className="flex items-start gap-3 p-5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={e => save({ enabled: e.target.checked })}
                        disabled={saving}
                        className="mt-0.5 rounded border-white/20 w-4 h-4"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-100">Activar regla</span>
                        <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">
                          Enciende o apaga toda la alerta de una vez.
                        </span>
                      </span>
                    </label>

                    {rule.enabled && (
                      <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/[.06]">
                        <div className="flex items-center justify-between pt-4">
                          <span className="flex items-center gap-2 text-sm text-gray-200">
                            <Mail className="w-4 h-4 text-gray-400" /> Enviar por correo
                          </span>
                          <Switch checked={rule.canalEmail} onChange={canal_email => save({ canal_email })} disabled={saving} />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Cuándo avisar</label>
                          <NoovaSelect
                            value={rule.modo}
                            onChange={v => save({ modo: v as InventoryAlertMode })}
                            options={MODE_OPTIONS}
                            allowEmpty={false}
                            disabled={saving}
                          />
                        </div>

                        {(rule.modo === "resumen_diario" || rule.modo === "ambos") && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5">Hora del resumen (Bogotá)</label>
                            <NoovaSelect
                              value={String(rule.horaResumen)}
                              onChange={v => save({ hora_resumen: Number(v) })}
                              options={HOUR_OPTIONS}
                              allowEmpty={false}
                              disabled={saving}
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Destinatarios (opcional)</label>
                          <input
                            value={destinatariosText}
                            onChange={e => setDestinatariosText(e.target.value)}
                            onBlur={() =>
                              save({
                                destinatarios: destinatariosText.split(",").map(e => e.trim()).filter(Boolean)
                              })
                            }
                            placeholder="correo1@empresa.com, correo2@empresa.com"
                            disabled={saving}
                            className="w-full rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600"
                          />
                          <p className="text-[11px] text-gray-600 mt-1">
                            Si lo dejas vacío, se avisa a todos los usuarios con permiso para administrar ERP.
                          </p>
                        </div>

                        {noRecipients && (
                          <InfoBox variant="warning" icon={Info} layout="row">
                            Sin destinatarios explícitos: se avisará a quienes tengan permiso de administración
                            sobre ERP en esta organización. Si nadie lo tiene, la alerta no llegará a nadie.
                          </InfoBox>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "ori" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-[#0f7eff]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-gray-100">ORI · Copiloto interno</h2>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-lg">
                        Deja que ORI consulte este inventario para responder preguntas sobre existencias.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[.08] bg-noova-surface overflow-hidden">
                    <label className="flex items-start gap-3 p-5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={oriEnabled}
                        onChange={e => saveOriAccess(e.target.checked)}
                        disabled={oriSaving}
                        className="mt-0.5 rounded border-white/20 w-4 h-4"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-100">ORI puede consultar este inventario</span>
                        <span className="block text-xs text-gray-500 leading-relaxed mt-0.5">
                          Podrá responder sobre existencias, productos por agotarse y listados por marca —
                          nunca lo ve el agente que habla con clientes externos.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
