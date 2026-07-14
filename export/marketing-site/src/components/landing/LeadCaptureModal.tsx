"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { COMPANY_SIZE_OPTIONS } from "@/lib/landing-leads";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { LeadCaptureIntent } from "@/components/landing/LeadCaptureProvider";
import { appApiPath } from "@/lib/marketing-api";

interface LeadCaptureModalProps {
  open: boolean;
  intent: LeadCaptureIntent | null;
  onClose: () => void;
}

const defaultTitles: Record<string, { title: string; subtitle: string }> = {
  explorador: {
    title: "Comenzar prueba gratuita",
    subtitle: "14 días · 15.000 créditos · sin tarjeta"
  },
  esencial: {
    title: "Plan Esencial",
    subtitle: "$82 USD/mes · 350.000 créditos"
  },
  crecimiento: {
    title: "Plan Crecimiento",
    subtitle: "$345 USD/mes · 1.500.000 créditos"
  },
  escala: {
    title: "Plan Escala",
    subtitle: "$815 USD/mes · 3.800.000 créditos"
  },
  corporativo: {
    title: "Hablar con ventas",
    subtitle: "Volumen y requisitos a medida"
  },
  demo: {
    title: "Agendar demo gratuita",
    subtitle: "Le contactamos en horario hábil"
  },
  acceso: {
    title: "Solicitar acceso a Noova 360",
    subtitle: "Complete el formulario y activaremos su cuenta manualmente"
  }
};

export default function LeadCaptureModal({ open, intent, onClose }: LeadCaptureModalProps) {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(false);
    setSubmitting(false);
  }, [open, intent?.source]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !intent) return null;

  const planKey = intent.planInterest ?? "demo";
  const copy = defaultTitles[planKey] ?? defaultTitles.demo;
  const title = intent.title ?? copy.title;
  const subtitle = intent.subtitle ?? copy.subtitle;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(appApiPath("/api/landing/leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: intent!.source,
          plan_interest: intent!.planInterest ?? null,
          company_name: companyName,
          contact_name: contactName,
          email,
          phone: phone || null,
          company_size: companySize,
          message: message || null
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar. Intente de nuevo.");
        return;
      }

      setSuccess(true);
      setSubmittedEmail(email);
      setCompanyName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setCompanySize("");
      setMessage("");
    } catch {
      setError("Error de conexión. Intente de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[.1] bg-[#0c0d14] shadow-2xl shadow-black/50">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-white/[.08] bg-[#0c0d14]/95 backdrop-blur px-6 py-5">
          <div>
            <h2 id="lead-modal-title" className="text-xl font-bold text-white">
              {title}
            </h2>
            <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6">
          {success ? (
            <div className="text-center py-6">
              <p className="text-lg font-semibold text-white mb-2">¡Solicitud recibida!</p>
              <p className="text-sm text-gray-400 mb-6">
                Le contactaremos pronto a <span className="text-white">{submittedEmail}</span>.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-lg bg-[#5b5bf6] text-white text-sm font-semibold hover:bg-[#7070f8] transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="lead-company" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Empresa *
                </label>
                <input
                  id="lead-company"
                  required
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Ej. Corredores ABC Ltda."
                  className="w-full h-10 px-3 rounded-lg bg-white/[.05] border border-white/[.1] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]/50"
                />
              </div>

              <div>
                <label htmlFor="lead-name" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Nombre y apellido *
                </label>
                <input
                  id="lead-name"
                  required
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Ej. María García"
                  className="w-full h-10 px-3 rounded-lg bg-white/[.05] border border-white/[.1] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]/50"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="lead-email" className="block text-xs font-medium text-gray-400 mb-1.5">
                    Correo corporativo *
                  </label>
                  <input
                    id="lead-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="nombre@empresa.com"
                    className="w-full h-10 px-3 rounded-lg bg-white/[.05] border border-white/[.1] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]/50"
                  />
                </div>
                <div>
                  <label htmlFor="lead-phone" className="block text-xs font-medium text-gray-400 mb-1.5">
                    WhatsApp / teléfono
                  </label>
                  <input
                    id="lead-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+57 300 000 0000"
                    className="w-full h-10 px-3 rounded-lg bg-white/[.05] border border-white/[.1] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]/50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lead-size" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Tamaño de la empresa *
                </label>
                <NoovaSelect
                  value={companySize}
                  onChange={setCompanySize}
                  allowEmpty={true}
                  emptyLabel="Seleccione…"
                  placeholder="Seleccione…"
                  options={COMPANY_SIZE_OPTIONS.map(opt => ({
                    value: opt.value,
                    label: opt.label
                  }))}
                />
              </div>

              <div>
                <label htmlFor="lead-message" className="block text-xs font-medium text-gray-400 mb-1.5">
                  ¿Qué le gustaría automatizar? (opcional)
                </label>
                <textarea
                  id="lead-message"
                  rows={3}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Ej. WhatsApp + lectura de pólizas PDF, formatos…"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[.05] border border-white/[.1] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#5b5bf6]/50 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-lg bg-[#5b5bf6] text-white text-sm font-semibold hover:bg-[#7070f8] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  "Enviar solicitud"
                )}
              </button>

              <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                Al enviar acepta ser contactado por Noova 360 respecto a esta solicitud.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
