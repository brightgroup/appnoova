"use client";

import { useEffect, useState } from "react";
import {
  Phone, ShoppingCart, Link2, ChevronLeft, ChevronRight, Sparkles,
  Loader2, CheckCircle2, AlertCircle, ArrowRight
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, btnGhost, textMuted } from "@/lib/brand-ui";
import { TELEPHONY_COUNTRIES } from "@/lib/telephony/countries";
import { NoovaSelect } from "@/components/ui/NoovaSelect";

type Flow = "choose" | "purchase" | "verify";
type PurchaseStep = 1 | 2 | 3;
type VerifyStep = 1 | 2;

interface ClientLineWizardProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  voiceAgentId?: string | null;
}

const selectCls =
  "w-full bg-noova-main border border-white/[.12] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50";

export function ClientLineWizard({ open, onClose, onSuccess, voiceAgentId }: ClientLineWizardProps) {
  const [flow, setFlow] = useState<Flow>("choose");
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>(1);
  const [verifyStep, setVerifyStep] = useState<VerifyStep>(1);
  const [country, setCountry] = useState("CO");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFlow("choose");
    setPurchaseStep(1);
    setVerifyStep(1);
    setError("");
    setDone(false);
    setNotes("");
    setPhone("");
  }, [open]);

  async function submit(type: "purchase_line" | "verify_outbound") {
    setSubmitting(true);
    setError("");
    const res = await authFetch("/api/telephony/requests", {
      method: "POST",
      body: JSON.stringify({
        request_type: type,
        country_code: country,
        phone_e164: type === "verify_outbound" ? phone.trim() : undefined,
        notes: notes || undefined,
        voice_agent_id: voiceAgentId ?? null
      })
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar");
      return;
    }
    setDone(true);
    onSuccess();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <div className="relative bg-noova-surface border border-white/[.10] rounded-3xl p-8 max-w-lg w-full shadow-2xl overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#0f7eff]/10 rounded-full blur-3xl pointer-events-none" />

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Solicitud enviada</h2>
            <p className={`text-sm ${textMuted} mb-6`}>Noova revisará tu pedido y te asignará la línea pronto.</p>
            <button onClick={onClose} className={btnPrimary}>Entendido</button>
          </div>
        ) : flow === "choose" ? (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#0f7eff]" />
                <span className="text-xs font-medium text-[#0f7eff]">Teléfono</span>
              </div>
              <h2 className="text-xl font-bold text-white">¿Qué necesitas?</h2>
              <p className={`text-sm ${textMuted} mt-1`}>Elige cómo quieres conectar tu línea</p>
            </div>
            <div className="grid grid-cols-1 gap-3 mb-6">
              <button
                onClick={() => setFlow("purchase")}
                className="group flex items-start gap-4 p-5 rounded-2xl border border-white/[.08] hover:border-[#0f7eff]/40 hover:bg-white/[.03] text-left transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-[#0f7eff]/20 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5 text-[#0f7eff]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white text-sm">Solicitar línea Noova</h3>
                  <p className={`text-xs ${textMuted} mt-1 leading-relaxed`}>
                    Línea dedicada inbound + outbound. Noova la compra y configura por ti.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-white shrink-0 mt-1" />
              </button>
              <button
                onClick={() => setFlow("verify")}
                className="group flex items-start gap-4 p-5 rounded-2xl border border-white/[.08] hover:border-[#0f7eff]/40 hover:bg-white/[.03] text-left transition-all"
              >
                <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Link2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white text-sm">Vincular mi línea existente</h3>
                  <p className={`text-xs ${textMuted} mt-1 leading-relaxed`}>
                    Verifica tu +57 para llamadas salientes (outbound). Inbound sigue en tu teléfono.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-white shrink-0 mt-1" />
              </button>
            </div>
            <button onClick={onClose} className={`w-full ${btnGhost}`}>Cancelar</button>
          </>
        ) : flow === "purchase" ? (
          <>
            <div className="mb-4">
              <span className="text-xs text-[#0f7eff]">Solicitar línea · Paso {purchaseStep}/3</span>
              <h2 className="text-lg font-bold text-white mt-1">
                {purchaseStep === 1 && "País de la línea"}
                {purchaseStep === 2 && "Detalles adicionales"}
                {purchaseStep === 3 && "Confirmar solicitud"}
              </h2>
            </div>
            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
            )}
            {purchaseStep === 1 && (
              <NoovaSelect
                value={country}
                onChange={setCountry}
                allowEmpty={false}
                options={TELEPHONY_COUNTRIES.map(c => ({
                  value: c.code,
                  label: `${c.flag} ${c.label}`
                }))}
              />
            )}
            {purchaseStep === 2 && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Ciudad, prefijo preferido, uso (ventas, soporte)..."
                className={`${selectCls} resize-none`}
              />
            )}
            {purchaseStep === 3 && (
              <div className="rounded-xl border border-white/[.10] bg-noova-main p-4 text-sm space-y-2">
                <p><span className={textMuted}>Tipo:</span> <span className="text-white">Línea Noova nueva</span></p>
                <p><span className={textMuted}>País:</span> <span className="text-white">{TELEPHONY_COUNTRIES.find(c => c.code === country)?.label}</span></p>
                {notes && <p><span className={textMuted}>Notas:</span> <span className="text-white">{notes}</span></p>}
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button
                onClick={() => purchaseStep === 1 ? setFlow("choose") : setPurchaseStep(s => (s - 1) as PurchaseStep)}
                className={btnGhost}
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              {purchaseStep < 3 ? (
                <button onClick={() => setPurchaseStep(s => (s + 1) as PurchaseStep)} className={btnPrimary}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => submit("purchase_line")} disabled={submitting} className={btnPrimary}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  Enviar solicitud
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <span className="text-xs text-cyan-400">Vincular línea · Paso {verifyStep}/2</span>
              <h2 className="text-lg font-bold text-white mt-1">
                {verifyStep === 1 ? "Tu número de negocio" : "Confirmar verificación"}
              </h2>
            </div>
            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            {verifyStep === 1 && (
              <>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className={selectCls}
                />
                <p className={`text-xs ${textMuted} mt-2`}>Te llamaremos o enviaremos un código para verificar propiedad.</p>
              </>
            )}
            {verifyStep === 2 && (
              <div className="rounded-xl border border-white/[.10] bg-noova-main p-4 text-sm">
                <p className={textMuted}>Verificar número:</p>
                <p className="font-mono font-bold text-white text-lg mt-1">{phone}</p>
                <p className={`text-xs ${textMuted} mt-3`}>Solo outbound — las llamadas entrantes no van al agente IA.</p>
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button
                onClick={() => verifyStep === 1 ? setFlow("choose") : setVerifyStep(1)}
                className={btnGhost}
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              {verifyStep === 1 ? (
                <button
                  onClick={() => { if (!phone.trim()) { setError("Ingresa tu número"); return; } setError(""); setVerifyStep(2); }}
                  className={btnPrimary}
                >
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => submit("verify_outbound")} disabled={submitting} className={btnPrimary}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Solicitar verificación
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
