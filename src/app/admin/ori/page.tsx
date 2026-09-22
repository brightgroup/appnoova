"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { adminRegistryPage, adminRegistryContent, btnPrimary } from "@/lib/brand-ui";

/**
 * Plantilla base de Ori — la que reciben TODAS las organizaciones. Lo que cada
 * cliente agrega encima se edita desde su propio dashboard
 * (/dashboard/ori/instrucciones) y se anexa a esto, nunca lo reemplaza.
 */
export default function AdminOriPage() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [factory, setFactory] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/ori-prompt");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      setPrompt(data.prompt as string);
      setFactory(data.factory as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la plantilla.");
      setPrompt("");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (prompt === null) return;
    setSaving(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/ori-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");
      setPrompt(data.prompt as string);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const dirtyFromFactory = prompt !== null && factory !== "" && prompt.trim() !== factory.trim();

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={Sparkles}
        title="Ori"
        subtitle="Plantilla base del copiloto — la reciben todas las organizaciones"
        action={
          <button onClick={handleSave} disabled={saving || prompt === null} className={`${btnPrimary} disabled:opacity-50`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        }
      />

      <div className={adminRegistryContent}>
        <div className="max-w-4xl space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>
          )}
          {saved && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4" /> Guardado. Aplica en el próximo mensaje de cualquier organización.
            </div>
          )}

          <div className="p-4 rounded-xl bg-white/[.03] border border-white/[.08] text-xs text-gray-400 leading-relaxed">
            Esto es el comportamiento de producto de Ori: alcance, personalidad y límites. Las reglas de las herramientas
            (inventario, cotizaciones, siniestros) viven en el código y no se editan acá — son el contrato con cada
            herramienta. Si un cliente necesita reglas propias de su negocio, las configura él mismo desde{" "}
            <span className="text-gray-300">Ori → Instrucciones</span> en su dashboard, y se suman a esta base.
          </div>

          {prompt === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <textarea
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setSaved(false); }}
                rows={26}
                spellCheck={false}
                className="w-full bg-noova-surface border border-white/[.08] rounded-xl px-4 py-3 font-mono text-[13px] text-gray-100 leading-relaxed resize-y min-h-[420px] focus:outline-none focus:border-[#0f7eff]/40"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">{prompt.length} caracteres</span>
                {dirtyFromFactory && (
                  <button
                    onClick={() => { setPrompt(factory); setSaved(false); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar plantilla de fábrica
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
