"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ListTree } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { registryPage, registryToolbar, registryContent, registryPanel, textMuted } from "@/lib/brand-ui";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { PolizaRamoCamposPanel } from "@/components/seguros/PolizaRamoCamposPanel";

interface RamoOption { id: string; nombre: string; }

export default function PolizaCamposPage() {
  const [ramos, setRamos] = useState<RamoOption[]>([]);
  const [ramoId, setRamoId] = useState("");

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/ramos", { headers });
      if (res.ok) setRamos((await res.json()).ramos ?? []);
    })();
  }, []);

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/seguros/polizas" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Campos por ramo</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>
              Cada ramo puede necesitar datos distintos (ej. placa para Autos, beneficiarios para Vida) — defínelos aquí y aparecen como columna en Pólizas.
            </p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        <div className={`${registryPanel} max-w-2xl space-y-5`}>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
              <ListTree className="w-3.5 h-3.5" /> Ramo
            </label>
            <NoovaSelect
              value={ramoId}
              onChange={setRamoId}
              allowEmpty
              emptyLabel="Elegir ramo…"
              options={ramos.map(r => ({ value: r.id, label: r.nombre }))}
            />
          </div>

          {ramoId && <PolizaRamoCamposPanel ramoId={ramoId} />}
        </div>
      </div>
    </div>
  );
}
