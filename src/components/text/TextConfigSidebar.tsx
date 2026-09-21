"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { AgentPromptButton, AgentSidebarField, AgentSidebarSlider } from "@/components/agents/AgentSidebarField";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { Switch } from "@/components/ui/Switch";
import { TEXT_OUTPUT_TOKEN_OPTIONS } from "@/lib/text-agent-options";
import type { TextAgentFormData } from "@/types/text-agent";
import type { CompanyContext } from "@/types/company-context";

/** Configuración del agente de texto, al lado del chat de prueba: se ajusta y
 *  se ve el efecto en el mismo sitio, sin cambiar de pestaña. Los conectores y el
 *  modelo no están aquí: viven en el propio chat, junto al composer. */
export function TextConfigSidebar({
  form,
  setForm,
  contexts,
  onEditPrompt
}: {
  form: TextAgentFormData;
  setForm: Dispatch<SetStateAction<TextAgentFormData>>;
  contexts: CompanyContext[];
  onEditPrompt: () => void;
}) {
  return (
    <div className="px-5 py-2 pb-8">
      <AgentPromptButton onClick={onEditPrompt} hint="Rol, objetivo y tono del agente." />

      <AgentSidebarField label="Nombre del agente">
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full rounded-lg border border-[var(--nv-input-border)] bg-[var(--nv-bg-control)] px-3 py-2 text-sm text-[var(--nv-text)] focus:border-[#0f7eff]/50 focus:outline-none"
        />
      </AgentSidebarField>

      <AgentSidebarSlider
        label="Temperatura"
        hint="Creatividad del modelo (0.1 = precisa · 2 = más libre)"
        value={form.temperature}
        min={0.1}
        max={2}
        step={0.1}
        onChange={v => setForm(f => ({ ...f, temperature: v }))}
      />

      <AgentSidebarField
        label="Tokens de salida"
        hint="Tope de seguridad; el largo real de la respuesta lo define el prompt."
      >
        <NoovaSelect
          value={String(form.max_output_tokens)}
          onChange={v => setForm(f => ({ ...f, max_output_tokens: parseInt(v, 10) }))}
          allowEmpty={false}
          options={TEXT_OUTPUT_TOKEN_OPTIONS.map(o => ({ value: String(o.id), label: o.label }))}
        />
      </AgentSidebarField>

      <AgentSidebarField label="Marca / contexto">
        <NoovaSelect
          value={form.company_context_id ?? ""}
          onChange={v => setForm(f => ({ ...f, company_context_id: v || null }))}
          allowEmpty={true}
          emptyLabel="Sin marca (solo prompt del agente)"
          options={contexts.map(c => ({
            value: c.id,
            label: `${c.name}${c.is_default ? " · predeterminada" : ""}`
          }))}
        />
        <Link
          href="/dashboard/contextos"
          className="mt-2 inline-block text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
        >
          Gestionar contextos de marca →
        </Link>
      </AgentSidebarField>

      <AgentSidebarField
        label="Solo respuesta humana"
        hint="La IA no responde. Los mensajes quedan en el inbox para que los atienda el equipo."
        action={
          <Switch
            checked={form.human_only === true}
            onChange={v => setForm(f => ({ ...f, human_only: v }))}
          />
        }
      />
    </div>
  );
}
