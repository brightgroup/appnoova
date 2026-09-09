"use client";

import { useEffect, useRef, useState } from "react";
import { X, ShieldCheck, Search, UserPlus, Check } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, btnPrimary, nvControl } from "@/lib/brand-ui";
import { PolizaBeneficiariosPanel } from "@/components/seguros/PolizaBeneficiariosPanel";
import type { PolizaRecord, PolizaPeriodicidad, PolizaTipo } from "@/lib/insurers/polizas-db";

const fieldClass = `w-full ${nvControl} px-4 py-2.5 text-sm`;

interface ContactoOption {
  id: string;
  name: string;
  telefono: string | null;
  whatsapp: string | null;
  documento_id: string | null;
}

interface RamoOption {
  id: string;
  nombre: string;
}

export interface PolizaFormValues {
  contact_id: string | null;
  tomador: string;
  documento: string;
  telefono: string;
  aseguradora: string;
  ramo: string;
  ramo_id: string | null;
  numero_poliza: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  prima: string;
  periodicidad_pago: PolizaPeriodicidad | "";
  tipo_poliza: PolizaTipo;
  moneda: string;
}

interface PolizaModalProps {
  open: boolean;
  poliza?: PolizaRecord | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: PolizaFormValues) => void;
}

const PERIODICIDAD_OPTIONS: { value: PolizaPeriodicidad; label: string }[] = [
  { value: "anual", label: "Anual" },
  { value: "semestral", label: "Semestral" },
  { value: "trimestral", label: "Trimestral" },
  { value: "mensual", label: "Mensual" }
];

const TIPO_POLIZA_OPTIONS: { value: PolizaTipo; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "colectiva", label: "Colectiva" },
  { value: "masiva", label: "Masiva" }
];

const MONEDA_OPTIONS = ["COP", "USD", "EUR"];

/** Ramos donde tiene sentido pedir beneficiarios — mismo criterio que has_formulario_adicional_beneficiarios de Softseguros. */
function ramoUsaBeneficiarios(nombreRamo: string): boolean {
  const n = nombreRamo.toLowerCase();
  return n.includes("vida") || n.includes("salud") || n.includes("exequias");
}

export function PolizaModal({ open, poliza, saving, error, onClose, onSubmit }: PolizaModalProps) {
  const isEdit = Boolean(poliza);

  const [contactId, setContactId] = useState<string | null>(null);
  const [tomadorQuery, setTomadorQuery] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactoOption[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [documento, setDocumento] = useState("");
  const [telefono, setTelefono] = useState("");
  const [aseguradora, setAseguradora] = useState("");
  const [ramo, setRamo] = useState("");
  const [ramoId, setRamoId] = useState<string | null>(null);
  const [ramoOptions, setRamoOptions] = useState<RamoOption[]>([]);
  const [showRamoOptions, setShowRamoOptions] = useState(false);
  const [numeroPoliza, setNumeroPoliza] = useState("");
  const [vigenciaDesde, setVigenciaDesde] = useState("");
  const [vigenciaHasta, setVigenciaHasta] = useState("");
  const [prima, setPrima] = useState("");
  const [periodicidad, setPeriodicidad] = useState<PolizaPeriodicidad | "">("");
  const [tipoPoliza, setTipoPoliza] = useState<PolizaTipo>("individual");
  const [moneda, setMoneda] = useState("COP");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ramoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setContactId(null);
    setTomadorQuery("");
    setContactOptions([]);
    setShowOptions(false);
    setDocumento("");
    setTelefono("");
    setAseguradora(poliza?.aseguradora ?? "");
    setRamo(poliza?.ramo ?? "");
    setRamoId(poliza?.ramoId ?? null);
    setRamoOptions([]);
    setShowRamoOptions(false);
    setNumeroPoliza(poliza?.numeroPoliza ?? "");
    setVigenciaDesde(poliza?.vigenciaDesde ?? "");
    setVigenciaHasta(poliza?.vigenciaHasta ?? "");
    setPrima(poliza?.prima != null ? String(poliza.prima) : "");
    setPeriodicidad(poliza?.periodicidadPago ?? "");
    setTipoPoliza(poliza?.tipoPoliza ?? "individual");
    setMoneda(poliza?.moneda ?? "COP");
  }, [open, poliza]);

  function onTomadorChange(value: string) {
    setTomadorQuery(value);
    setContactId(null);
    setShowOptions(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setContactOptions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/polizas/contactos?q=${encodeURIComponent(value.trim())}`, { headers });
      if (res.ok) setContactOptions((await res.json()).contactos ?? []);
    }, 300);
  }

  function pickContact(c: ContactoOption) {
    setContactId(c.id);
    setTomadorQuery(c.name);
    setShowOptions(false);
  }

  function onRamoChange(value: string) {
    setRamo(value);
    setRamoId(null);
    setShowRamoOptions(true);
    if (ramoSearchTimer.current) clearTimeout(ramoSearchTimer.current);
    if (value.trim().length < 2) {
      setRamoOptions([]);
      return;
    }
    ramoSearchTimer.current = setTimeout(async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/seguros/ramos?q=${encodeURIComponent(value.trim())}`, { headers });
      if (res.ok) setRamoOptions((await res.json()).ramos ?? []);
    }, 250);
  }

  function pickRamo(r: RamoOption) {
    setRamoId(r.id);
    setRamo(r.nombre);
    setShowRamoOptions(false);
  }

  if (!open) return null;

  const canSubmit =
    (isEdit || contactId || tomadorQuery.trim()) && aseguradora.trim() && ramo.trim() && vigenciaHasta && !saving;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-noova-surface border border-white/[.10] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] sticky top-0 bg-noova-surface z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#0f7eff]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text)]">{isEdit ? "Editar póliza" : "Nueva póliza"}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {!isEdit && (
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1.5">Tomador</label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={tomadorQuery}
                  onChange={e => onTomadorChange(e.target.value)}
                  onFocus={() => setShowOptions(true)}
                  placeholder="Buscar contacto por nombre, documento o teléfono…"
                  className={`${fieldClass} pl-9`}
                />
                {contactId && <Check className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              {showOptions && tomadorQuery.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/[.10] bg-noova-surface shadow-2xl max-h-52 overflow-y-auto">
                  {contactOptions.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowOptions(false)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:bg-white/[.04]"
                    >
                      <UserPlus className="w-4 h-4" /> Se creará un contacto nuevo con este nombre
                    </button>
                  ) : (
                    contactOptions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickContact(c)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/[.04] border-b border-white/[.04] last:border-0"
                      >
                        <span className="block text-gray-100">{c.name}</span>
                        <span className="block text-xs text-gray-500">
                          {[c.documento_id, c.telefono || c.whatsapp].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {!contactId && tomadorQuery.trim() && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Documento (opcional)</label>
                    <input value={documento} onChange={e => setDocumento(e.target.value)} className={fieldClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Teléfono (opcional)</label>
                    <input value={telefono} onChange={e => setTelefono(e.target.value)} className={fieldClass} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Aseguradora</label>
              <input value={aseguradora} onChange={e => setAseguradora(e.target.value)} placeholder="Ej. La Equidad" className={fieldClass} />
            </div>
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1.5">Ramo</label>
              <div className="relative">
                <input
                  value={ramo}
                  onChange={e => onRamoChange(e.target.value)}
                  onFocus={() => setShowRamoOptions(true)}
                  placeholder="Ej. Autos, Vida…"
                  className={fieldClass}
                />
                {ramoId && <Check className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              {showRamoOptions && ramo.trim().length >= 2 && ramoOptions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/[.10] bg-noova-surface shadow-2xl max-h-52 overflow-y-auto">
                  {ramoOptions.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pickRamo(r)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-100 hover:bg-white/[.04] border-b border-white/[.04] last:border-0"
                    >
                      {r.nombre}
                    </button>
                  ))}
                </div>
              )}
              {!ramoId && ramo.trim().length >= 2 && (
                <p className="text-[11px] text-gray-600 mt-1">
                  No está en el catálogo estándar — se guarda como texto libre.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Número de póliza (opcional)</label>
            <input value={numeroPoliza} onChange={e => setNumeroPoliza(e.target.value)} className={fieldClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Vigencia desde</label>
              <input type="date" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Vigencia hasta</label>
              <input type="date" value={vigenciaHasta} onChange={e => setVigenciaHasta(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Prima (opcional)</label>
              <input type="number" min={0} value={prima} onChange={e => setPrima(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Periodicidad de pago</label>
              <select
                value={periodicidad}
                onChange={e => setPeriodicidad(e.target.value as PolizaPeriodicidad | "")}
                className={fieldClass}
              >
                <option value="">Sin definir</option>
                {PERIODICIDAD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Tipo de póliza</label>
              <select value={tipoPoliza} onChange={e => setTipoPoliza(e.target.value as PolizaTipo)} className={fieldClass}>
                {TIPO_POLIZA_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Moneda</label>
              <select value={moneda} onChange={e => setMoneda(e.target.value)} className={fieldClass}>
                {MONEDA_OPTIONS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {isEdit && poliza && ramoUsaBeneficiarios(ramo) && (
            <PolizaBeneficiariosPanel polizaId={poliza.id} />
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08] sticky bottom-0 bg-noova-surface">
          <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                contact_id: contactId,
                tomador: tomadorQuery.trim(),
                documento,
                telefono,
                aseguradora,
                ramo,
                ramo_id: ramoId,
                numero_poliza: numeroPoliza,
                vigencia_desde: vigenciaDesde,
                vigencia_hasta: vigenciaHasta,
                prima,
                periodicidad_pago: periodicidad,
                tipo_poliza: tipoPoliza,
                moneda
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear póliza"}
          </button>
        </div>
      </div>
    </div>
  );
}
