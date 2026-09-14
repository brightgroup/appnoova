"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { modalInput, textMuted } from "@/lib/brand-ui";
import type { QuoteResultPeriodicidad } from "@/lib/insurers/quote-requests-db";

type Ramo = "autos" | "vida" | "hogar" | "salud";

const RAMO_OPTIONS: Array<{ value: Ramo; label: string }> = [
  { value: "autos", label: "Auto" },
  { value: "vida", label: "Vida" },
  { value: "hogar", label: "Hogar" },
  { value: "salud", label: "Salud" }
];

const PERIODICIDAD_OPCIONES: Array<{ value: QuoteResultPeriodicidad; label: string }> = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
  { value: "mensual_y_anual", label: "Mensual y anual" },
  { value: "pago_unico", label: "Pago único" }
];

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className={`block text-xs ${textMuted} mb-1`}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className={`${modalInput} w-full`} />
    </div>
  );
}

interface QuoteRequestCreateFormProps {
  mode: "solicitud" | "cotizacion";
}

/** Formulario de creación manual — comparte estructura entre "Nueva solicitud" (queda pendiente) y "Nueva cotización" (pide además el resultado y la deja lista de una vez). */
export function QuoteRequestCreateForm({ mode }: QuoteRequestCreateFormProps) {
  const router = useRouter();
  const [ramo, setRamo] = useState<Ramo>("autos");
  const [placa, setPlaca] = useState("");
  const [nombreTomador, setNombreTomador] = useState("");
  const [documentoTomador, setDocumentoTomador] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [nombrePlan, setNombrePlan] = useState("");
  const [periodicidad, setPeriodicidad] = useState<QuoteResultPeriodicidad>("mensual");
  const [prima, setPrima] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!nombreTomador.trim() || !documentoTomador.trim()) {
      setError("Completa nombre y documento del tomador");
      return;
    }
    if (mode === "cotizacion" && !prima.trim()) {
      setError("Ingresa la prima de la cotización");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/cotizaciones", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ramo,
          placa: ramo === "autos" && placa.trim() ? placa.trim().toUpperCase() : undefined,
          tomador: {
            nombre_tomador: nombreTomador.trim(),
            documento_tomador: documentoTomador.trim(),
            fecha_nacimiento_tomador: fechaNacimiento || undefined
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la solicitud");
        return;
      }
      const id = data.request.id as string;

      if (mode === "cotizacion") {
        const primaNum = Number(prima.replace(/[^\d]/g, ""));
        const quoteRes = await fetch(`/api/seguros/cotizaciones/${id}/registrar-manual`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            prima: primaNum,
            aseguradora: aseguradora.trim() || undefined,
            nombre_plan: nombrePlan.trim() || undefined,
            periodicidad
          })
        });
        if (!quoteRes.ok) {
          const quoteData = await quoteRes.json().catch(() => ({}));
          setError(quoteData.error || "La solicitud se creó, pero no se pudo registrar la prima");
          router.push(`/dashboard/crm/solicitudes/${id}`);
          return;
        }
        router.push(`/dashboard/crm/cotizaciones/${id}`);
        return;
      }

      router.push(`/dashboard/crm/solicitudes/${id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrmDetailLayout
      backHref={mode === "cotizacion" ? "/dashboard/crm/cotizaciones" : "/dashboard/crm/solicitudes"}
      title={mode === "cotizacion" ? "Nueva cotización" : "Nueva solicitud"}
      saving={saving}
      saveLabel="Guardar"
      onSave={handleSave}
      error={error}
    >
      <div className="space-y-6">
        <div>
          <label className={`block text-xs ${textMuted} mb-1`}>Ramo</label>
          <NoovaSelect value={ramo} onChange={v => setRamo(v as Ramo)} allowEmpty={false} options={RAMO_OPTIONS} />
        </div>

        {ramo === "autos" && <Field label="Placa" value={placa} onChange={setPlaca} />}

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Datos del tomador</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre completo" value={nombreTomador} onChange={setNombreTomador} />
            <Field label="Número de documento" value={documentoTomador} onChange={setDocumentoTomador} />
            <Field label="Fecha de nacimiento" value={fechaNacimiento} onChange={setFechaNacimiento} type="date" />
          </div>
        </div>

        {mode === "cotizacion" && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resultado</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aseguradora" value={aseguradora} onChange={setAseguradora} />
              <Field label="Nombre del plan (opcional)" value={nombrePlan} onChange={setNombrePlan} />
              <div>
                <label className={`block text-xs ${textMuted} mb-1`}>Frecuencia de pago</label>
                <NoovaSelect
                  value={periodicidad}
                  onChange={v => setPeriodicidad(v as QuoteResultPeriodicidad)}
                  allowEmpty={false}
                  options={PERIODICIDAD_OPCIONES}
                />
              </div>
              <Field label="Prima en COP" value={prima} onChange={setPrima} />
            </div>
          </div>
        )}
      </div>
    </CrmDetailLayout>
  );
}
