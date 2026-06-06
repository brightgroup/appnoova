"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Save, Loader2, Trash2, Star, Sparkles, Globe } from "lucide-react";
import { getAuthHeaders } from "@/lib/voice-agents-api";
import type { CompanyContext } from "@/types/company-context";

const emptyForm = { name: "", content: "", website_url: "", is_default: false };

export default function ContextosPage() {
  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dbReady, setDbReady] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts", { headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al cargar contextos");
        return;
      }
      setDbReady(data.dbReady !== false);
      const list = (data.contexts ?? []) as CompanyContext[];
      setContexts(list);
      if (list.length && !selectedId) {
        setSelectedId(list[0].id);
        setForm({
          name: list[0].name,
          content: list[0].content,
          website_url: list[0].website_url ?? "",
          is_default: list[0].is_default
        });
      }
    } catch {
      setError("Error de red");
    }
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectContext = (ctx: CompanyContext) => {
    setSelectedId(ctx.id);
    setForm({
      name: ctx.name,
      content: ctx.content,
      website_url: ctx.website_url ?? "",
      is_default: ctx.is_default
    });
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm({ ...emptyForm, name: `Marca ${contexts.length + 1}` });
  };

  const handleGenerateFromUrl = async () => {
    if (!form.website_url.trim()) {
      setError("Ingresa la URL de la empresa primero");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts/generate-from-url", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: form.website_url })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo generar el contexto");
        return;
      }
      setForm(f => ({
        ...f,
        content: data.content,
        website_url: data.website_url ?? f.website_url,
        name: f.name.trim() && !f.name.startsWith("Marca ") ? f.name : (data.suggested_name || f.name)
      }));
    } catch {
      setError("Error de red al generar contexto");
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...form, id: selectedId ?? undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      const saved = data.context as CompanyContext;
      setSelectedId(saved.id);
      await load();
      selectContext(saved);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este contexto? Los agentes que lo usen quedarán sin marca asignada.")) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/company-contexts?id=${id}`, { method: "DELETE", headers });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "No se pudo eliminar");
      return;
    }
    setSelectedId(null);
    setForm(emptyForm);
    load();
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0d0e14] text-white min-h-0">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-violet-400" />
          <div>
            <h1 className="text-lg font-bold">Contextos de marca</h1>
            <p className="text-xs text-gray-500">
              Define la info de cada correduría o marca. Pega la URL y la IA genera un borrador de contexto.
            </p>
          </div>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Nueva marca
        </button>
      </div>

      {!dbReady && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
          Ejecuta las migraciones de contextos en Supabase SQL Editor.
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <aside className="w-64 border-r border-white/[.08] p-4 overflow-y-auto shrink-0">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : contexts.length === 0 ? (
            <p className="text-sm text-gray-500 leading-relaxed">
              Crea una marca y pega la URL de tu sitio para generar el contexto automáticamente.
            </p>
          ) : (
            <ul className="space-y-1">
              {contexts.map(ctx => (
                <li key={ctx.id}>
                  <button
                    onClick={() => selectContext(ctx)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                      selectedId === ctx.id
                        ? "bg-violet-600/20 text-white border border-violet-500/30"
                        : "text-gray-400 hover:text-white hover:bg-white/[.06]"
                    }`}
                  >
                    {ctx.is_default && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                    <span className="truncate">{ctx.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex-1 p-6 overflow-y-auto">
          {(selectedId || form.name) ? (
            <div className="max-w-3xl space-y-5">
              <Field label="Nombre de la marca">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="Ej. Correduría ABC, Marca Mapfre Juan"
                />
              </Field>

              <Field label="Sitio web de la empresa">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="url"
                      value={form.website_url}
                      onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
                      className={`${inputCls} pl-10`}
                      placeholder="https://tucorreduria.com"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateFromUrl}
                    disabled={generating || !form.website_url.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-sm font-semibold whitespace-nowrap disabled:opacity-40 shrink-0"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? "Leyendo..." : "Generar contexto"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                  Genera un contexto listo para agentes (Voice Agent Context) con productos, casos de uso, tono y frases de marca.
                </p>
              </Field>

              <Field label="Contexto de la empresa">
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={14}
                  className={`${inputCls} font-mono text-sm leading-relaxed resize-y min-h-[280px]`}
                  placeholder={`Ejemplo:\n- Correduría ABC, Bogotá\n- Seguros: vida, auto, hogar (Mapfre, SBS, Allianz)\n- Horario: lun–vie 8am–6pm\n- Tono: profesional y cercano`}
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                  className="rounded border-white/20"
                />
                Usar como contexto por defecto (Ori y agentes sin marca asignada)
              </label>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !dbReady}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar
                </button>
                {selectedId && (
                  <button
                    onClick={() => handleDelete(selectedId)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Building2 className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm max-w-sm">
                Selecciona una marca o crea una nueva. Pega la URL de tu empresa para generar el contexto con IA.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-2">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-[#12131a] border border-white/[.08] rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-violet-500/40";
