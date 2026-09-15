"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Search, MessagesSquare, ListChecks } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { registryPage, registryToolbar, registryContent, textMuted, inputSearch, tabActive, tabIdle } from "@/lib/brand-ui";
import { resolveRamoIcon } from "@/lib/ramo-icons";
import { Switch } from "@/components/ui/Switch";
import { PolizaRamoCamposPanel } from "@/components/seguros/PolizaRamoCamposPanel";
import { RAMOS_COTIZABLES, type RamoCotizable } from "@/lib/insurers/ramos-cotizables";

interface RamoOption {
  id: string;
  nombre: string;
  slug: string;
}

/** Todos los ramos con tool de cotización activa hoy en WhatsApp (dedicada o motor genérico, ver RAMOS_MOTOR_GENERICO) — el resto del catálogo (93 ramos) no tiene preguntas de IA que configurar. */
const RAMOS_IA: { key: RamoCotizable; label: string }[] = (Object.keys(RAMOS_COTIZABLES) as RamoCotizable[]).map(key => ({
  key,
  label: RAMOS_COTIZABLES[key].label
}));

type TabId = "ofrecidos" | "preguntas";
const TABS: { id: TabId; label: string; icon: typeof ListChecks }[] = [
  { id: "ofrecidos", label: "Ramos ofrecidos", icon: ListChecks },
  { id: "preguntas", label: "Preguntas que hace la IA", icon: MessagesSquare }
];

function PreguntasIASection({ ramos }: { ramos: RamoOption[] }) {
  const [ramoKey, setRamoKey] = useState<RamoCotizable>(RAMOS_IA[0].key);
  const [search, setSearch] = useState("");
  const [countsByRamoId, setCountsByRamoId] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/seguros/ramo-campos", { headers });
      if (!res.ok) return;
      const campos = ((await res.json()).campos ?? []) as { ramoId: string }[];
      const counts: Record<string, number> = {};
      for (const c of campos) counts[c.ramoId] = (counts[c.ramoId] ?? 0) + 1;
      setCountsByRamoId(counts);
    })();
  }, []);

  const filtered = RAMOS_IA.filter(r => r.label.toLowerCase().includes(search.trim().toLowerCase()));
  const ramoCatalogo = ramos.find(r => r.slug === RAMOS_COTIZABLES[ramoKey].catalogoSlug);
  const activeLabel = RAMOS_IA.find(r => r.key === ramoKey)?.label ?? "";

  return (
    <div>
      <p className={`text-xs ${textMuted} mb-4`}>
        Qué le pregunta la IA al cliente para cotizar cada ramo por WhatsApp — el texto, las opciones (botones/lista) y si son obligatorias.
      </p>

      <div className="grid md:grid-cols-[220px_1fr] gap-0 rounded-2xl border border-white/[.08] overflow-hidden min-h-[420px]">
        <div className="border-b md:border-b-0 md:border-r border-white/[.08] p-2.5 md:max-h-[560px] md:overflow-y-auto">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar ramo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/[.08] bg-white/[.03] pl-8 pr-2.5 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/40"
            />
          </div>
          {filtered.map(r => {
            const catalogo = ramos.find(x => x.slug === RAMOS_COTIZABLES[r.key].catalogoSlug);
            const { icon: Icon, color } = resolveRamoIcon(RAMOS_COTIZABLES[r.key].catalogoSlug);
            const isActive = ramoKey === r.key;
            const count = catalogo ? countsByRamoId[catalogo.id] : undefined;
            return (
              <button
                key={r.key}
                onClick={() => setRamoKey(r.key)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                  isActive ? "bg-[#0f7eff]/[.14] text-white font-medium" : "text-gray-300 hover:bg-white/[.05] hover:text-white"
                }`}
              >
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="truncate flex-1">{r.label}</span>
                {!!count && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isActive ? "bg-white/[.15] text-[#3392ff]" : "bg-white/[.06] text-gray-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="text-xs text-gray-500 text-center py-6">Sin resultados.</p>}
        </div>

        <div className="p-5">
          <h3 className="text-sm font-semibold text-white mb-3">{activeLabel}</h3>
          {!ramoCatalogo ? (
            <p className="text-sm text-gray-500">Este ramo todavía no existe en el catálogo — recarga la página en un momento.</p>
          ) : (
            <PolizaRamoCamposPanel ramoId={ramoCatalogo.id} ramo={ramoKey} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SegurosConfiguracionPage() {
  const [ramos, setRamos] = useState<RamoOption[]>([]);
  const [ofrecidos, setOfrecidos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("ofrecidos");

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
              Qué ramos ofrece tu agencia y qué le pregunta la IA al cliente para cotizar cada uno por WhatsApp.
            </p>
          </div>
        </div>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive ? tabActive : tabIdle
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className={registryContent}>
        <div className="max-w-4xl mx-auto">
          {activeTab === "ofrecidos" && (
            <>
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
            </>
          )}

          {activeTab === "preguntas" && (loading ? (
            <div className="flex justify-center py-16 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando ramos…
            </div>
          ) : (
            <PreguntasIASection ramos={ramos} />
          ))}
        </div>
      </div>
    </div>
  );
}
