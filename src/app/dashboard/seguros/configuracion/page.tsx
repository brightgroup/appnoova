"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { registryPage, registryToolbar, registryContent, textMuted, inputSearch } from "@/lib/brand-ui";
import { resolveRamoIcon } from "@/lib/ramo-icons";
import { Switch } from "@/components/ui/Switch";

interface RamoOption {
  id: string;
  nombre: string;
  slug: string;
}

export default function SegurosConfiguracionPage() {
  const [ramos, setRamos] = useState<RamoOption[]>([]);
  const [ofrecidos, setOfrecidos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const headers = await getAuthHeaders();
      const [ramosRes, configRes] = await Promise.all([
        fetch("/api/seguros/ramos", { headers }),
        fetch("/api/seguros/config/ramos", { headers })
      ]);
      if (ramosRes.ok) setRamos((await ramosRes.json()).ramos ?? []);
      if (configRes.ok) setOfrecidos(new Set((await configRes.json()).ramos_ofrecidos ?? []));
      setLoading(false);
    })();
  }, []);

  const filteredRamos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ramos;
    return ramos.filter(r => r.nombre.toLowerCase().includes(q));
  }, [ramos, search]);

  async function toggleRamo(slug: string, checked: boolean) {
    const next = new Set(ofrecidos);
    if (checked) next.add(slug);
    else next.delete(slug);
    setOfrecidos(next);
    setSavingSlug(slug);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/config/ramos", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ramos_ofrecidos: Array.from(next) })
      });
      if (!res.ok) {
        // revierte si falló
        setOfrecidos(ofrecidos);
      }
    } finally {
      setSavingSlug(null);
    }
  }

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/seguros/polizas" className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Configuración</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>
              Marca los ramos que tu agencia realmente ofrece — le da contexto a los agentes de IA y a otros procesos de Noova Seguros.
            </p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        <div className="max-w-4xl mx-auto">
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar ramo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={inputSearch}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-16 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando ramos…
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filteredRamos.map(ramo => {
                const { icon: Icon, color } = resolveRamoIcon(ramo.slug);
                const checked = ofrecidos.has(ramo.slug);
                return (
                  <div
                    key={ramo.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-3"
                  >
                    <span
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-sm text-gray-200 flex-1 truncate">{ramo.nombre}</span>
                    {savingSlug === ramo.slug ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500 shrink-0" />
                    ) : (
                      <Switch checked={checked} onChange={v => toggleRamo(ramo.slug, v)} />
                    )}
                  </div>
                );
              })}
              {filteredRamos.length === 0 && (
                <p className="sm:col-span-2 text-center text-sm text-gray-500 py-10">
                  Ningún ramo coincide con &quot;{search}&quot;.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
