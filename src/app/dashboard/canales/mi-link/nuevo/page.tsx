"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Link2, ArrowRight, Sparkles } from "lucide-react";
import { btnPrimary } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  DEFAULT_MICROSITE_ACCENT,
  DEFAULT_MICROSITE_BUTTON,
  DEFAULT_MICROSITE_QUICK_ACTIONS
} from "@/lib/microsite-defaults";
import { buildMicrositePublicUrl, getMicrositePublicBaseUrl, isValidMicrositeSlug, slugifyBrandName } from "@/lib/microsite-slug";
import type { CompanyContext } from "@/types/company-context";

export default function MiLinkNuevoPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [linkLimit, setLinkLimit] = useState<{ used: number; max: number | null } | null>(null);

  const publicBaseDisplay = getMicrositePublicBaseUrl().replace(/^https?:\/\//, "");

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [siteRes, ctxRes] = await Promise.all([
        fetch("/api/microsite", { headers }),
        fetch("/api/company-contexts", { headers })
      ]);
      const siteData = await siteRes.json();
      const ctxData = await ctxRes.json();

      if (siteRes.ok && siteData.links) {
        const links = siteData.links as { used: number; max: number | null };
        setLinkLimit(links);
        if (links.max != null && links.used >= links.max) {
          router.replace("/dashboard/canales/mi-link");
          return;
        }
      }

      if (ctxRes.ok) {
        const list = (ctxData.contexts ?? []) as CompanyContext[];
        const def = list.find(c => c.is_default) ?? list[0];
        if (def) setSlug(prev => prev || slugifyBrandName(def.name));
      }
    } catch {
      setError("Error de red al cargar");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { loadContext(); }, [loadContext]);

  const handleCreate = async () => {
    const normalized = slugifyBrandName(slug);
    if (!isValidMicrositeSlug(normalized)) {
      setError("Usa letras minúsculas, números y guiones (3–50 caracteres).");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const agentsRes = await fetch("/api/text/agents", { headers });
      const agentsData = await agentsRes.json();
      const defAgent = (agentsData.agents ?? [])[0];

      const res = await fetch("/api/microsite", {
        method: "POST",
        headers,
        body: JSON.stringify({
          slug: normalized,
          text_agent_id: defAgent?.id ?? null,
          accent_color: DEFAULT_MICROSITE_ACCENT,
          button_color: DEFAULT_MICROSITE_BUTTON,
          quick_actions: DEFAULT_MICROSITE_QUICK_ACTIONS,
          is_published: false
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear el link");
        return;
      }
      router.push(`/dashboard/canales/mi-link/configuracion?id=${data.microsite.id}&tab=link`);
    } catch {
      setError("Error de red al crear el link");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando...
      </div>
    );
  }

  const previewUrl = slug ? buildMicrositePublicUrl(slugifyBrandName(slug)) : "";

  return (
    <div className="flex-1 flex flex-col bg-noova-main min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/canales/mi-link" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Crear Mi Link</h1>
            <p className="text-xs text-gray-400">Paso 1 · Define la URL de tu micrositio</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="relative w-full max-w-lg rounded-3xl border border-white/[.10] bg-noova-surface p-8 shadow-2xl overflow-hidden">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-[#0f7eff]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f7eff]/10 border border-[#0f7eff]/20">
                <Sparkles className="w-3 h-3 text-[#0f7eff]" />
                <span className="text-xs font-medium text-[#0f7eff]">
                  {linkLimit ? `${linkLimit.used}/${linkLimit.max ?? "∞"} links usados` : "Cargando cupo..."}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0f7eff] to-[#3392ff] flex items-center justify-center">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Elige tu URL pública</h2>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-8">
              Este nombre queda <strong className="text-gray-200">definitivo</strong> para tu micrositio de chat.
            </p>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
            )}
            <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Tu link</label>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500 shrink-0">{publicBaseDisplay}/</span>
              <input
                value={slug}
                onChange={e => setSlug(slugifyBrandName(e.target.value))}
                className="flex-1 bg-white/[.04] border border-white/[.10] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#0f7eff]/50"
                placeholder="mi-empresa"
                autoFocus
              />
            </div>
            {previewUrl && <p className="text-[11px] text-[#99c9ff] mb-6 font-mono truncate">{previewUrl}</p>}
            <button onClick={handleCreate} disabled={creating || !slug.trim()} className={`${btnPrimary} w-full justify-center py-3`}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Crear mi link <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
