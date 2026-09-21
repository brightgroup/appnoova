"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";

export interface BillingProfile {
  tipo_persona: "natural" | "juridica";
  tipo_documento: "CC" | "NIT" | "CE" | "PA";
  numero_documento: string;
  digito_verificacion: string | null;
  razon_social: string;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  email_facturacion: string | null;
}

const emptyForm: BillingProfile = {
  tipo_persona: "juridica",
  tipo_documento: "NIT",
  numero_documento: "",
  digito_verificacion: "",
  razon_social: "",
  direccion: "",
  ciudad: "",
  telefono: "",
  email_facturacion: "",
};

/**
 * Datos fiscales requeridos antes de poder pagar un plan (persona natural/
 * jurídica, documento, razón social, dirección) — se usan para poder emitir
 * después la factura electrónica DIAN. Vive en /dashboard/perfil (ficha de
 * facturación); sin outer card — el contenedor con título lo pone quien la usa.
 */
export function BillingProfileForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<BillingProfile> | null;
  onSaved: (profile: BillingProfile) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<BillingProfile>({ ...emptyForm, ...(initial ?? {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof BillingProfile>(key: K, value: BillingProfile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    setSaving(true);
    setError("");
    const res = await authFetch("/api/billing/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudieron guardar los datos");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved(json.profile);
  }

  const isNatural = form.tipo_persona === "natural";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Tipo</label>
          <select
            value={form.tipo_persona}
            onChange={(e) => {
              const v = e.target.value as BillingProfile["tipo_persona"];
              set("tipo_persona", v);
              if (v === "natural" && form.tipo_documento === "NIT") set("tipo_documento", "CC");
              if (v === "juridica") set("tipo_documento", "NIT");
            }}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
          >
            <option value="juridica">Empresa (persona jurídica)</option>
            <option value="natural">Persona natural</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Tipo de documento</label>
          <select
            value={form.tipo_documento}
            onChange={(e) => set("tipo_documento", e.target.value as BillingProfile["tipo_documento"])}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
          >
            {isNatural ? (
              <>
                <option value="CC">Cédula de ciudadanía</option>
                <option value="CE">Cédula de extranjería</option>
                <option value="PA">Pasaporte</option>
              </>
            ) : (
              <option value="NIT">NIT</option>
            )}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">
            {isNatural ? "Número de documento" : "NIT (sin dígito de verificación)"}
          </label>
          <input
            value={form.numero_documento}
            onChange={(e) => set("numero_documento", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
            placeholder={isNatural ? "1234567890" : "900123456"}
          />
        </div>

        {!isNatural && (
          <div>
            <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Dígito de verificación</label>
            <input
              value={form.digito_verificacion ?? ""}
              onChange={(e) => set("digito_verificacion", e.target.value)}
              className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
              placeholder="7"
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">
            {isNatural ? "Nombre completo" : "Razón social"}
          </label>
          <input
            value={form.razon_social}
            onChange={(e) => set("razon_social", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
            placeholder={isNatural ? "Nombre y apellidos" : "Nombre de la empresa"}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Dirección</label>
          <input
            value={form.direccion ?? ""}
            onChange={(e) => set("direccion", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Ciudad</label>
          <input
            value={form.ciudad ?? ""}
            onChange={(e) => set("ciudad", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Teléfono</label>
          <input
            value={form.telefono ?? ""}
            onChange={(e) => set("telefono", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold text-[var(--nv-text-muted)] uppercase">Email de facturación</label>
          <input
            value={form.email_facturacion ?? ""}
            onChange={(e) => set("email_facturacion", e.target.value)}
            className="w-full mt-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-xs text-[var(--nv-text)]"
            placeholder="facturacion@tuempresa.com"
          />
        </div>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className={`${btnPrimary} disabled:opacity-50`}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Guardar datos
        </button>
        {onCancel && (
          <button onClick={onCancel} className={btnGhost}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
