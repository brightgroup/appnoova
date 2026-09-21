"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, Settings2,
  History, Radio, BarChart3, CalendarClock, Bell
} from "lucide-react";
import { btnPrimary, tabActive, tabIdle } from "@/lib/brand-ui";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { getTextTemplateMeta } from "@/lib/text-agent-templates";
import { getPurposeMeta } from "@/lib/agent-purpose-catalog";
import { AgentConnectorsPopover } from "@/components/agents/AgentConnectorsPopover";
import { AgentPromptModal } from "@/components/agents/AgentPromptModal";
import { TextAgentIcon } from "@/components/icons/TextAgentIcon";
import { normalizeTextAgentForm } from "@/lib/text-agent-form";
import { TEXT_LLM_MODELS } from "@/lib/text-agent-options";
import { llmModelIcon } from "@/lib/llm/provider-icon";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import type { TextAgentFormData, TextAgentRecord } from "@/types/text-agent";
import type { CompanyContext } from "@/types/company-context";
import type { DataTableRecord } from "@/types/data-table";
import { TextAgentTestPanel } from "@/components/text/TextAgentTestPanel";
import { TextConfigSidebar } from "@/components/text/TextConfigSidebar";
import { ChatRegistryPanel } from "@/components/text/ChatRegistryPanel";
import { NotifyTeamRulesEditor } from "@/components/text/NotifyTeamRulesEditor";
import { SchedulingRulesEditor } from "@/components/scheduling/SchedulingRulesEditor";
import { defaultNotifyTeamRules, hasIncompleteWhatsAppNotifyRule } from "@/lib/text-notify-rules";
import { defaultSchedulingRules } from "@/lib/scheduling/rules";

type TabId = "config" | "agendamiento" | "notificaciones" | "analisis" | "registro" | "canales";

const ENABLED_TABS: TabId[] = ["config", "registro", "agendamiento", "notificaciones"];

/** "Probar agente" y "Conectores" se fusionaron dentro de "Configurar y
 *  probar". Los enlaces viejos (y los marcadores que la gente ya tenga)
 *  siguen llegando a donde esperaban. */
const TAB_ALIASES: Record<string, TabId> = {
  probar: "config",
  conectores: "config"
};

function parseTab(tab: string | null): TabId {
  if (!tab) return "config";
  if (TAB_ALIASES[tab]) return TAB_ALIASES[tab];
  if ((ENABLED_TABS as string[]).includes(tab)) return tab as TabId;
  return "config";
}

function ConfigContent() {
  const router = useRouter();
  const params = useSearchParams();
  const agentIdParam = params.get("id");

  const [activeTab, setActiveTab] = useState<TabId>(() => parseTab(params.get("tab")));

  const setTab = useCallback((tab: TabId) => {
    if (!agentIdParam) return;
    setActiveTab(tab);
    const qs = new URLSearchParams();
    qs.set("id", agentIdParam);
    qs.set("tab", tab);
    router.replace(`/dashboard/agentes-texto/configuracion?${qs.toString()}`, { scroll: false });
  }, [router, agentIdParam]);

  useEffect(() => {
    setActiveTab(parseTab(params.get("tab")));
  }, [params]);

  const [editorMode, setEditorMode] = useState<"preview" | "markdown">("markdown");
  const [promptOpen, setPromptOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState<TextAgentFormData>({
    source_template: "customer-assistant",
    name: "",
    prompt: "",
    company_context_id: null,
    data_table_id: null,
    temperature: 0.7,
    llm_model: TEXT_LLM_MODELS[0].id,
    max_output_tokens: 1024,
    color: null,
    notify_rules: defaultNotifyTeamRules(),
    scheduling_rules: defaultSchedulingRules(),
    human_only: false
  });

  const [contexts, setContexts] = useState<CompanyContext[]>([]);
  const [dataTables, setDataTables] = useState<DataTableRecord[]>([]);
  const [registryRefresh, setRegistryRefresh] = useState(0);

  const meta = getTextTemplateMeta(form.source_template);

  const loadDataTables = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/data-tables", { headers });
      const data = await res.json();
      if (res.ok) setDataTables(data.tables ?? []);
    } catch { /* optional */ }
  }, []);

  const loadContexts = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/company-contexts", { headers });
      const data = await res.json();
      if (res.ok) setContexts(data.contexts ?? []);
    } catch { /* optional */ }
  }, []);

  const loadAgent = useCallback(async () => {
    if (!agentIdParam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/text/agents?id=${agentIdParam}`, { headers });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cargar configuración");
        return;
      }

      if (data.agent) {
        const a = data.agent as TextAgentRecord;
        setAgentId(a.id);
        setForm(normalizeTextAgentForm(a));
        setSaved(true);
      } else {
        setError("Agente no encontrado");
      }
    } catch {
      setError("Error de red al cargar el agente");
    } finally {
      setLoading(false);
    }
  }, [agentIdParam]);

  useEffect(() => { loadAgent(); }, [loadAgent]);
  useEffect(() => { loadContexts(); }, [loadContexts]);
  useEffect(() => { loadDataTables(); }, [loadDataTables]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/text/agents", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...form,
          id: agentId,
          source_template: form.source_template,
          color: meta.color
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      setAgentId(data.agent?.id ?? null);
      setSaved(true);
    } catch {
      setError("Error de red al guardar");
    }
    setSaving(false);
  };

  const notifyIncomplete = hasIncompleteWhatsAppNotifyRule(form.notify_rules ?? {});
  const isSegurosTemplate = getPurposeMeta("text", form.source_template).vertical === "seguros";

  const tabs: { id: TabId; label: string; icon: React.ElementType; warn?: boolean }[] = [
    { id: "config", label: "Configurar y probar", icon: Settings2 },
    { id: "agendamiento", label: "Agendamiento", icon: CalendarClock },
    { id: "notificaciones", label: "Notificaciones", icon: Bell, warn: notifyIncomplete },
    { id: "analisis", label: "Análisis", icon: BarChart3 },
    { id: "registro", label: "Registro de chats", icon: History },
    { id: "canales", label: "Canales", icon: Radio }
  ];

  if (!agentIdParam) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-noova-main text-center px-6">
        <p className="text-sm text-gray-400 max-w-md leading-relaxed">
          Cada agente pertenece a tu cuenta. Créalo desde{" "}
          <strong className="text-white">Agentes de texto → Nuevo agente</strong> y ábrelo desde la lista.
        </p>
        <Link
          href="/dashboard/agentes-texto"
          className="mt-4 px-4 py-2 rounded-lg bg-[#0f7eff] hover:bg-[#3392ff] text-white text-sm font-semibold"
        >
          Ir a mis agentes
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando configuración...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/agentes-texto"
            className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-full bg-[#0f7eff]/10 flex items-center justify-center shrink-0">
            <TextAgentIcon className="w-[22px] h-[22px]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{form.name}</h1>
            <p className="text-xs text-gray-400">
              Plantilla: {meta.tag} · {meta.description}
              {!saved && " · Sin guardar aún"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`${btnPrimary} shrink-0`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const disabled = !ENABLED_TABS.includes(tab.id);

          return (
            <button
              key={tab.id}
              disabled={disabled}
              onClick={() => !disabled && setTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? tabActive
                  : disabled
                    ? "text-gray-700 cursor-not-allowed border-transparent"
                    : tabIdle
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
              {tab.warn && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-red-400"
                  title="Falta completar la configuración de WhatsApp"
                />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}

      {activeTab === "config" && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col">
            <TextAgentTestPanel
              agentId={agentId}
              llmModel={form.llm_model}
              ready={!loading && !!agentId}
              humanOnly={form.human_only === true}
              onConversationSaved={() => setRegistryRefresh(k => k + 1)}
              modelSelector={
                <NoovaSelect
                  value={form.llm_model}
                  onChange={llm_model => setForm(f => ({ ...f, llm_model }))}
                  allowEmpty={false}
                  className="w-auto min-w-[130px]"
                  options={TEXT_LLM_MODELS.map(m => ({ value: m.id, label: m.label, icon: llmModelIcon(m.id) }))}
                />
              }
              composerAccessory={
                <AgentConnectorsPopover
                  showDataTable
                  dataTableId={form.data_table_id ?? null}
                  onChangeDataTableId={data_table_id => setForm(f => ({ ...f, data_table_id }))}
                  dataTables={dataTables}
                  isSegurosTemplate={isSegurosTemplate}
                  quotingRules={form.quoting_rules}
                  onChangeQuotingRules={value =>
                    setForm(f => ({
                      ...f,
                      quoting_rules: { ...value, insurer_connection_ids: f.quoting_rules?.insurer_connection_ids ?? [] }
                    }))
                  }
                  wooCommerceRules={form.woocommerce_rules}
                  onChangeWooCommerceRules={woocommerce_rules => setForm(f => ({ ...f, woocommerce_rules }))}
                />
              }
            />
          </div>

          <aside className="w-[300px] shrink-0 border-l border-[var(--nv-border)] overflow-y-auto">
            <TextConfigSidebar
              form={form}
              setForm={setForm}
              contexts={contexts}
              onEditPrompt={() => setPromptOpen(true)}
            />
          </aside>
        </div>
      )}

      {activeTab === "agendamiento" && (
        <div className="flex-1 overflow-y-auto p-6">
          <SchedulingRulesEditor
            value={form.scheduling_rules}
            onChange={scheduling_rules => setForm(f => ({ ...f, scheduling_rules }))}
          />
        </div>
      )}

      {activeTab === "notificaciones" && (
        <div className="flex-1 overflow-y-auto p-6">
          <NotifyTeamRulesEditor
            value={form.notify_rules}
            onChange={notify_rules => setForm(f => ({ ...f, notify_rules }))}
          />
        </div>
      )}

      {activeTab === "registro" && agentId && (
        <ChatRegistryPanel agentId={agentId} refreshKey={registryRefresh} />
      )}


      <AgentPromptModal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        subtitle={`${form.name || "Agente de texto"} · ${meta.tag}`}
        value={form.prompt}
        onChange={prompt => setForm(f => ({ ...f, prompt }))}
        editorMode={editorMode}
        onChangeEditorMode={setEditorMode}
      />
    </div>
  );
}

export default function ConfiguracionTextoPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <ConfigContent />
    </Suspense>
  );
}
