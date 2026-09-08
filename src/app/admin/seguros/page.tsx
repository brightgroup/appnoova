"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, CheckCircle2, Loader2, Save, Shield } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { adminRegistryPage, adminRegistryContent, btnPrimary } from "@/lib/brand-ui";

type ProviderKey = "verifik" | "placapi";

const PROVIDERS: { key: ProviderKey; label: string; description: string }[] = [
  {
    key: "verifik",
    label: "Verifik",
    description: "$0.20-0.40 USD por consulta según volumen. Solo pide la placa."
  },
  {
    key: "placapi",
    label: "PlacApi",
    description:
      "149-349 COP por consulta (5-15x más barato). Exige placa + documento del propietario en la misma consulta."
  }
];

const cardCls = "rounded-xl border border-white/[.08] bg-white/[.02] p-4";

export default function VehicleDataProviderPage() {
  const [provider, setProvider] = useState<ProviderKey>("verifik");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await authFetch("/api/admin/vehicle-data-provider");
      if (res.ok) {
        const data = await res.json();
        setProvider(data.rules?.provider === "placapi" ? "placapi" : "verifik");
      }
      setLoading(false);
    })();
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await authFetch("/api/admin/vehicle-data-provider", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }, [provider]);

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar icon={Shield} backHref="/admin" title="Noova Seguros" subtitle="Proveedor de datos vehiculares" />
      <div className={adminRegistryContent}>
        <div className={`${cardCls} max-w-2xl`}>
          <div className="flex items-center gap-2 mb-1">
            <Car className="w-4 h-4 text-[#6f95f2]" />
            <p className="text-sm font-medium text-white">Cuenta compartida de Noova</p>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Proveedor que usa el cotizador de autos cuando el corredor NO conectó su propia cuenta (Verifik o
            PlacApi) desde el conector de su organización.
          </p>

          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          ) : (
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <label
                  key={p.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    provider === p.key ? "border-[#0f7eff]/50 bg-[#0f7eff]/[.06]" : "border-white/[.08]"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    checked={provider === p.key}
                    onChange={() => setProvider(p.key)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{p.label}</p>
                    <p className="text-xs text-gray-500">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className={`${btnPrimary} mt-4 gap-2`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
