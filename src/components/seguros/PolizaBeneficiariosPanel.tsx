"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnGhost, nvControl } from "@/lib/brand-ui";

interface Beneficiario {
  id: string;
  nombre: string;
  documento: string | null;
  parentesco: string | null;
  porcentajeBeneficio: number | null;
}

const fieldClass = `w-full ${nvControl} px-3 py-2 text-sm`;

/**
 * Autocontenido: cada acción guarda al toque (no espera al botón "Guardar" del modal padre) —
 * mismo criterio que el resto de sub-recursos de una póliza ya guardada, para no perder cambios
 * si el usuario cierra el modal sin guardar el resto del formulario.
 */
export function PolizaBeneficiariosPanel({ polizaId }: { polizaId: string }) {
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [porcentaje, setPorcentaje] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/seguros/polizas/${polizaId}/beneficiarios`, { headers });
    if (res.ok) setBeneficiarios((await res.json()).beneficiarios ?? []);
    setLoading(false);
  }, [polizaId]);

  useEffect(() => { void load(); }, [load]);

  async function addBeneficiario() {
    if (!nombre.trim()) return;
    setAdding(true);
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/polizas/${polizaId}/beneficiarios`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        nombre: nombre.trim(),
        documento: documento || null,
        parentesco: parentesco || null,
        porcentaje_beneficio: porcentaje === "" ? null : Number(porcentaje)
      })
    });
    setNombre("");
    setDocumento("");
    setParentesco("");
    setPorcentaje("");
    setAdding(false);
    void load();
  }

  async function removeBeneficiario(id: string) {
    const headers = await getAuthHeaders();
    await fetch(`/api/seguros/polizas/beneficiarios/${id}`, { method: "DELETE", headers });
    void load();
  }

  return (
    <div className="rounded-xl border border-white/[.08] bg-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
        <Users className="w-4 h-4 text-[#99c9ff]" /> Beneficiarios
      </div>

      {loading ? (
        <div className="flex items-center text-gray-400 text-xs py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Cargando…
        </div>
      ) : (
        <ul className="space-y-1.5">
          {beneficiarios.map(b => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[.03] px-3 py-2 text-xs">
              <span className="text-gray-200 truncate">
                {b.nombre}
                {b.parentesco ? ` · ${b.parentesco}` : ""}
                {b.porcentajeBeneficio != null ? ` · ${b.porcentajeBeneficio}%` : ""}
              </span>
              <button type="button" onClick={() => removeBeneficiario(b.id)} className="text-gray-500 hover:text-red-400 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
          {beneficiarios.length === 0 && <p className="text-xs text-gray-600">Sin beneficiarios registrados.</p>}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" className={fieldClass} />
        <input value={documento} onChange={e => setDocumento(e.target.value)} placeholder="Documento" className={fieldClass} />
        <input value={parentesco} onChange={e => setParentesco(e.target.value)} placeholder="Parentesco" className={fieldClass} />
        <input
          type="number"
          min={0}
          max={100}
          value={porcentaje}
          onChange={e => setPorcentaje(e.target.value)}
          placeholder="% beneficio"
          className={fieldClass}
        />
      </div>
      <button type="button" disabled={!nombre.trim() || adding} onClick={addBeneficiario} className={`${btnGhost} !text-xs !py-1.5`}>
        <Plus className="w-3.5 h-3.5" /> {adding ? "Agregando…" : "Agregar beneficiario"}
      </button>
    </div>
  );
}
