"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler
} from "@xyflow/react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  CheckCircle2,
  Search,
  Webhook,
  Globe,
  X,
  Info,
  Pencil,
  Trash2,
  Radio
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { tabActive, tabIdle } from "@/lib/brand-ui";
import { Badge } from "@/components/ui/Badge";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import {
  ConnectionsContext,
  ChannelsContext,
  NODE_BRAND_COLOR,
  NODE_TITLE,
  WORKFLOW_NODE_TYPES,
  resolveNodeLabel,
  CopyButton
} from "@/components/automations/workflow-nodes";
import { DeleteWorkflowModal } from "@/components/automations/DeleteWorkflowModal";
import { AutomationEventsTable, prettyPrint, type AutomationEventRow } from "@/components/automations/AutomationEventsTable";
import { WhatsAppLogo } from "@/components/icons/brands/WhatsAppLogo";
import { NODE_CATALOG, type WorkflowNodeType, type WorkflowNodeData } from "@/lib/automations/node-types";
import type { WorkflowRecord } from "@/lib/automations/workflows-db";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

type Tab = "editor" | "ejecuciones";

const TABS: { id: Tab; label: string }[] = [
  { id: "editor", label: "Editor" },
  { id: "ejecuciones", label: "Ejecuciones" }
];

const NODE_PICKER_ICON: Record<WorkflowNodeType, React.ReactNode> = {
  "trigger.whatsapp_message": <WhatsAppLogo className="w-4 h-4 text-white" />,
  "trigger.webhook": <Webhook className="w-4 h-4 text-white" strokeWidth={1.8} />,
  "action.webhook": <Globe className="w-4 h-4 text-white" strokeWidth={1.6} />,
  "action.send_whatsapp_message": <WhatsAppLogo className="w-4 h-4 text-white" />
};

const TRIGGER_TYPES: WorkflowNodeType[] = ["trigger.whatsapp_message", "trigger.webhook"];

interface WhatsAppTemplateOption {
  id: string;
  template_name: string;
  body_preview: string;
  variable_labels: string[];
  channel_label: string;
}

export function WorkflowEditor({ workflowId, initialTab }: { workflowId: string; initialTab?: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab === "ejecuciones" ? "ejecuciones" : "editor");
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [connections, setConnections] = useState<AutomationConnectionRecord[]>([]);
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplateOption[]>([]);
  const [events, setEvents] = useState<AutomationEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node<WorkflowNodeData>>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);

  const setTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      router.replace(`/dashboard/workflows/${workflowId}?tab=${tab}`, { scroll: false });
    },
    [router, workflowId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [wfRes, connRes, evRes, chRes, tplRes] = await Promise.all([
      authFetch(`/api/automations/workflows/${workflowId}`),
      authFetch("/api/automations/connections"),
      authFetch(`/api/automations/workflows/${workflowId}/events`),
      authFetch("/api/whatsapp/channels"),
      authFetch("/api/automations/templates")
    ]);
    const wfJson = await wfRes.json();
    if (!wfRes.ok) {
      setError(wfJson.error ?? "No se pudo cargar el workflow");
      setLoading(false);
      return;
    }
    setWorkflow(wfJson.workflow);
    setNodes(wfJson.workflow.graph.nodes);
    setEdges(wfJson.workflow.graph.edges);
    setSaved(true);

    if (connRes.ok) setConnections((await connRes.json()).connections ?? []);
    if (evRes.ok) setEvents((await evRes.json()).events ?? []);
    if (chRes.ok) setChannels((await chRes.json()).channels ?? []);
    if (tplRes.ok) setTemplates((await tplRes.json()).templates ?? []);
    setLoading(false);
  }, [workflowId, setNodes, setEdges]);

  useEffect(() => { void load(); }, [load]);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      onNodesChangeBase(changes);
      setSaved(false);
    },
    [onNodesChangeBase]
  );
  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      onEdgesChangeBase(changes);
      setSaved(false);
    },
    [onEdgesChangeBase]
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge(connection, eds));
      setSaved(false);
    },
    [setEdges]
  );

  const onNodeDoubleClick = useCallback<NodeMouseHandler>((_event, node) => {
    setPaletteOpen(false);
    setConfigNodeId(node.id);
  }, []);

  function addNode(type: WorkflowNodeType) {
    const id = crypto.randomUUID();
    // El nodo Webhook entrante genera su URL propia de inmediato — sin fricción, sin esperar a Guardar.
    const data: WorkflowNodeData = type === "trigger.webhook" ? { webhookToken: crypto.randomUUID().replace(/-/g, "") } : {};
    setNodes(nds => [
      ...nds,
      { id, type, position: { x: 60 + nds.length * 230, y: 160 }, data }
    ]);
    setSaved(false);
    setPaletteOpen(false);
    setPaletteSearch("");
  }

  const configNode = useMemo(() => nodes.find(n => n.id === configNodeId) ?? null, [nodes, configNodeId]);

  function setNodeData(nodeId: string, patch: Partial<WorkflowNodeData>) {
    setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    setSaved(false);
  }

  function startRename() {
    if (!workflow) return;
    setNameDraft(workflow.name);
    setEditingName(true);
  }

  async function commitRename() {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!workflow || !name || name === workflow.name) return;
    setSavingName(true);
    const res = await authFetch(`/api/automations/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    setSavingName(false);
    if (res.ok) setWorkflow(prev => (prev ? { ...prev, name } : prev));
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await authFetch(`/api/automations/workflows/${workflowId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) router.push("/dashboard/workflows");
    else setDeleteOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    const graph = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target }))
    };
    const res = await authFetch(`/api/automations/workflows/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify({ graph })
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando workflow…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-noova-main text-gray-400 text-sm gap-3">
        <p>{error || "Workflow no encontrado"}</p>
        <Link href="/dashboard/workflows" className="text-[#5b5bf6] hover:underline">Volver a Workflows</Link>
      </div>
    );
  }

  const panelOpen = paletteOpen || Boolean(configNode);

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/workflows" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={e => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  className="text-lg font-bold bg-white/[.06] border border-white/[.16] rounded-lg px-2 py-0.5 outline-none focus:border-[#5b5bf6] min-w-0"
                />
              ) : (
                <button
                  type="button"
                  onClick={startRename}
                  className="group flex items-center gap-1.5 min-w-0"
                  title="Editar nombre"
                >
                  <h1 className="text-lg font-bold truncate">{workflow.name}</h1>
                  {savingName ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500 shrink-0" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              )}
              {workflow.status === "active" ? <Badge variant="emerald">Activo</Badge> : <Badge variant="neutral">Pausado</Badge>}
            </div>
            <p className="text-xs text-gray-400">
              {events.length} ejecuciones registradas{!saved && " · Sin guardar"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            title="Eliminar workflow"
            aria-label="Eliminar workflow"
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || saved}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <DeleteWorkflowModal
        workflowName={deleteOpen ? workflow.name : null}
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id ? tabActive : tabIdle
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "editor" ? (
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <ConnectionsContext.Provider value={connections}>
          <ChannelsContext.Provider value={channels}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={() => setPaletteOpen(false)}
              nodeTypes={WORKFLOW_NODE_TYPES}
              fitView
              fitViewOptions={{ maxZoom: 0.75 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ style: { stroke: "#4b5563", strokeWidth: 2 } }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="rgba(255,255,255,.09)" />
              <Controls showInteractive={false} className="!shadow-none [&>button]:!bg-[#16171e] [&>button]:!border-white/[.12] [&>button]:!text-gray-300" />
            </ReactFlow>
          </ChannelsContext.Provider>
          </ConnectionsContext.Provider>

          <button
            type="button"
            onClick={() => {
              setConfigNodeId(null);
              setPaletteOpen(v => !v);
            }}
            aria-label="Agregar nodo"
            title="Agregar nodo"
            className={`absolute top-4 left-4 w-9 h-9 rounded-lg border flex items-center justify-center shadow-lg transition-colors ${
              paletteOpen
                ? "bg-[#5b5bf6] border-[#5b5bf6] text-white"
                : "bg-[#16171e] border-white/[.12] text-gray-300 hover:bg-[#1c1d27] hover:text-white"
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>

          <p className="absolute bottom-4 left-4 text-[11px] text-gray-500 pointer-events-none">
            Doble clic en un nodo para configurarlo
          </p>

          {/* Panel derecho — agregar nodo o configurar el nodo seleccionado, como el NDV de n8n */}
          <div
            className={`absolute top-0 right-0 bottom-0 w-[360px] max-w-[85vw] bg-[#16171e] border-l border-white/[.12] shadow-2xl flex flex-col transition-transform duration-200 ${
              panelOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {paletteOpen && (
              <>
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/[.08] shrink-0">
                  <h3 className="text-sm font-bold text-white">Nodos</h3>
                  <button type="button" onClick={() => setPaletteOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08]">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 border-b border-white/[.08] shrink-0">
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/25 border border-white/[.08]">
                    <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={paletteSearch}
                      onChange={e => setPaletteSearch(e.target.value)}
                      placeholder="Buscar un nodo…"
                      className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                  {(["trigger", "action"] as const).map(category => {
                    const items = NODE_CATALOG.filter(
                      n =>
                        n.category === category &&
                        (n.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                          n.description.toLowerCase().includes(paletteSearch.toLowerCase()))
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={category}>
                        <p className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {category === "trigger" ? "Disparadores" : "Acciones"}
                        </p>
                        {items.map(entry => (
                          <button
                            key={entry.type}
                            type="button"
                            onClick={() => addNode(entry.type)}
                            className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-white/[.06] transition-colors"
                          >
                            <span
                              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: NODE_BRAND_COLOR[entry.type] }}
                            >
                              {NODE_PICKER_ICON[entry.type]}
                            </span>
                            <span className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{entry.label}</p>
                              <p className="text-xs text-gray-500 truncate">{entry.description}</p>
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {configNode && !paletteOpen && (
              <NodeConfigPanel
                key={configNode.id}
                node={configNode}
                connections={connections}
                channels={channels}
                templates={templates}
                workflowId={workflowId}
                events={events}
                onSetData={patch => setNodeData(configNode.id, patch)}
                onClose={() => setConfigNodeId(null)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <AutomationEventsTable events={events} emptyLabel="Sin ejecuciones todavía." />
        </div>
      )}
    </div>
  );
}

function whatsappEventMatches(e: AutomationEventRow, mediaFilter: "image" | "text" | "any"): boolean {
  if (e.event_type !== "whatsapp.image_received" && e.event_type !== "whatsapp.text_received") return false;
  if (mediaFilter === "image") return e.event_type === "whatsapp.image_received";
  if (mediaFilter === "text") return e.event_type === "whatsapp.text_received";
  return true;
}

function webhookEventMatches(e: AutomationEventRow): boolean {
  return e.event_type === "webhook.received" || e.event_type === "automation.callback";
}

/**
 * Botón "Escuchar evento de prueba" (como n8n) — sondea los eventos del
 * workflow cada 2s hasta 2 minutos buscando uno real que llegue después de
 * hacer clic, para reemplazar el JSON de ejemplo por datos reales del cliente
 * o sistema externo, sin tener que fabricar valores de mentira en el editor.
 */
function TestListenButton({
  workflowId,
  matches,
  onCaptured
}: {
  workflowId: string;
  matches: (event: AutomationEventRow) => boolean;
  onCaptured: (event: AutomationEventRow) => void;
}) {
  const [listening, setListening] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const cancelledRef = useRef(false);

  async function startListening() {
    setTimedOut(false);
    setListening(true);
    cancelledRef.current = false;
    const startedAt = Date.now();
    const deadline = startedAt + 120_000;

    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (cancelledRef.current) return;
      const res = await authFetch(`/api/automations/workflows/${workflowId}/events`);
      if (cancelledRef.current) return;
      if (res.ok) {
        const json = await res.json();
        const found = ((json.events ?? []) as AutomationEventRow[]).find(
          e => new Date(e.created_at).getTime() > startedAt && matches(e)
        );
        if (found) {
          onCaptured(found);
          setListening(false);
          return;
        }
      }
    }
    setListening(false);
    setTimedOut(true);
  }

  function cancelListening() {
    cancelledRef.current = true;
    setListening(false);
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void startListening()}
          disabled={listening}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-default ${
            listening
              ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10 text-[#c4c4ff]"
              : "border-white/[.12] bg-white/[.04] text-white hover:bg-white/[.08]"
          }`}
        >
          {listening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
          {listening ? "Escuchando… manda un evento de prueba ahora" : "Escuchar evento de prueba"}
        </button>
        {listening && (
          <button
            type="button"
            onClick={cancelListening}
            title="Cancelar"
            aria-label="Cancelar"
            className="shrink-0 p-2 rounded-lg border border-white/[.12] bg-white/[.04] text-gray-400 hover:text-white hover:bg-white/[.08]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {timedOut && (
        <p className="text-[11px] text-amber-400 mt-1.5">No llegó ningún evento en 2 minutos. Intenta de nuevo.</p>
      )}
    </div>
  );
}

/** Nota explicativa consistente al tope de cada panel — qué hace el nodo, en un par de líneas. El ejemplo de JSON va colapsado y discreto, para no competir con la explicación ni con los controles. */
function InfoNote({
  children,
  example,
  exampleLabel = "Ejemplo de JSON",
  exampleIsReal
}: {
  children: React.ReactNode;
  /** JSON de ejemplo (ya formateado) — el mismo que este nodo produce o espera recibir en la vida real. */
  example?: string;
  exampleLabel?: string;
  /** true cuando `example` son datos reales capturados (no el ilustrativo) — se marca con un puntito para que se note sin ocupar espacio. */
  exampleIsReal?: boolean;
}) {
  const [showExample, setShowExample] = useState(false);
  return (
    <div className="mb-4">
      <div className="flex gap-2.5 p-3 rounded-lg bg-white/[.03] border border-white/[.08] text-xs text-gray-300 leading-relaxed">
        <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
        <div>{children}</div>
      </div>
      {example && (
        <button
          type="button"
          onClick={() => setShowExample(v => !v)}
          className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${showExample ? "rotate-90" : ""}`} />
          {exampleIsReal && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
          {exampleLabel}
        </button>
      )}
      {example && showExample && (
        <pre className="mt-1.5 text-[10px] font-mono text-gray-500 bg-black/20 border border-white/[.06] rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
          {example}
        </pre>
      )}
    </div>
  );
}

const EXAMPLE_JSON_IMAGE_EVENT = JSON.stringify(
  {
    event: "whatsapp.image_received",
    conversation_id: "5b1e2b6a-3f21-4c9e-8a11-9d2f6e7c1a02",
    contact: { phone: "+573001234567", label: "Juan Pérez" },
    image: { url: "https://.../foto.jpg", analysis: "Producto con empaque dañado" }
  },
  null,
  2
);

const EXAMPLE_JSON_TEXT_EVENT = JSON.stringify(
  {
    event: "whatsapp.text_received",
    conversation_id: "5b1e2b6a-3f21-4c9e-8a11-9d2f6e7c1a02",
    contact: { phone: "+573001234567", label: "Juan Pérez" },
    message: { text: "¿Tienen disponible la talla M?" }
  },
  null,
  2
);

const EXAMPLE_JSON_REPLY_DEFAULT = JSON.stringify(
  { conversation_id: "5b1e2b6a-3f21-4c9e-8a11-9d2f6e7c1a02", reply: { text: "¡Gracias por tu compra! Aquí tu guía: https://..." } },
  null,
  2
);

const EXAMPLE_JSON_REPLY_TEMPLATE = JSON.stringify(
  { conversation_id: "5b1e2b6a-3f21-4c9e-8a11-9d2f6e7c1a02", variables: ["Juan", "PED-4821"] },
  null,
  2
);

const EXAMPLE_JSON_REPLY_MEDIA = JSON.stringify(
  {
    conversation_id: "5b1e2b6a-3f21-4c9e-8a11-9d2f6e7c1a02",
    media: { url: "https://.../guia-envio.pdf", caption: "Aquí tu guía de envío" }
  },
  null,
  2
);

/** Select estándar de la app (mismo componente/estilo que Agentes de Texto) con su label — reutilizado por cualquier dropdown simple del editor. */
function SelectField({
  label,
  value,
  onChange,
  options,
  allowEmpty,
  emptyLabel
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-400 mb-1.5 uppercase tracking-wide">{label}</label>
      <NoovaSelect value={value} onChange={onChange} options={options} allowEmpty={allowEmpty ?? false} emptyLabel={emptyLabel} />
    </div>
  );
}

/** Selector de línea de WhatsApp — reutilizado por cualquier disparador de WhatsApp (imagen, texto, y los que se agreguen después). */
function ChannelSelectField({
  channels,
  value,
  onChange,
  kindLabel
}: {
  channels: WhatsAppChannelRecord[];
  value: string | undefined;
  onChange: (channelId: string) => void;
  /** Cómo nombrar lo que dispara este nodo en el texto de ayuda — ej. "imágenes", "mensajes". */
  kindLabel: string;
}) {
  return (
    <div>
      <SelectField
        label="Canal de WhatsApp"
        value={value ?? ""}
        onChange={onChange}
        allowEmpty
        emptyLabel="Cualquier canal de la organización"
        options={channels.map(c => ({ value: c.id, label: `${c.friendly_name || "WhatsApp"} · ${c.e164}` }))}
      />
      {channels.length === 0 ? (
        <p className="text-[11px] text-gray-500 mt-2">
          Todavía no tienes líneas de WhatsApp conectadas.{" "}
          <Link href="/dashboard/canales/whatsapp" className="text-[#5b5bf6] hover:underline">Conecta una</Link>.
        </p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          {value
            ? `Este workflow solo se activa con ${kindLabel} recibidos en esa línea. El resto de tus canales no lo disparan.`
            : `Si tienes varias líneas activas y no eliges una, este workflow se activa con ${kindLabel} de cualquiera de ellas.`}
        </p>
      )}
    </div>
  );
}

/** Campo de mapeo por dot-path dentro de un JSON entrante — reutilizable para cualquier acción que necesite leer un campo variable. */
function JsonPathField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
      <input
        type="text"
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white placeholder:text-gray-600"
      />
    </div>
  );
}

/** Interruptor sí/no — mismo lenguaje visual que el switch activo/pausado del listado de workflows. */
function ToggleField({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-300">{label}</p>
        {description && <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 mt-0.5 ${checked ? "bg-[#5b5bf6]" : "bg-white/[.14]"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${checked ? "translate-x-[14px]" : ""}`}
        />
      </button>
    </div>
  );
}

/** Campo de JSON multilínea — reutilizable para cualquier acción que necesite un cuerpo/headers editables a mano. */
function JsonTextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 5
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
      <textarea
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-xs font-mono text-white placeholder:text-gray-600 resize-y leading-relaxed"
      />
    </div>
  );
}

function NodeConfigPanel({
  node,
  connections,
  channels,
  templates,
  workflowId,
  events,
  onClose,
  onSetData
}: {
  node: Node<WorkflowNodeData>;
  connections: AutomationConnectionRecord[];
  channels: WhatsAppChannelRecord[];
  templates: WhatsAppTemplateOption[];
  workflowId: string;
  events: AutomationEventRow[];
  onClose: () => void;
  onSetData: (patch: Partial<WorkflowNodeData>) => void;
}) {
  const type = node.type as WorkflowNodeType;
  const color = NODE_BRAND_COLOR[type];
  const isTrigger = TRIGGER_TYPES.includes(type);
  const webhookUrl =
    typeof window !== "undefined" && node.data.webhookToken
      ? `${window.location.origin}/api/automations/inbound/${node.data.webhookToken}`
      : "";

  const displayLabel = resolveNodeLabel(type, node.data, channels, connections);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [capturedExample, setCapturedExample] = useState<AutomationEventRow | null>(() => {
    if (type === "trigger.whatsapp_message") {
      const mediaFilter = node.data.mediaFilter === "image" || node.data.mediaFilter === "text" ? node.data.mediaFilter : "any";
      return events.find(e => whatsappEventMatches(e, mediaFilter)) ?? null;
    }
    if (type === "trigger.webhook") {
      return events.find(webhookEventMatches) ?? null;
    }
    return null;
  });

  function startEditingLabel() {
    setLabelDraft(node.data.label ?? displayLabel);
    setEditingLabel(true);
  }
  function commitLabel() {
    setEditingLabel(false);
    const trimmed = labelDraft.trim();
    onSetData({ label: trimmed || undefined });
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[.08] shrink-0">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
          {NODE_PICKER_ICON[type]}
        </span>
        <div className="min-w-0 flex-1">
          {editingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={e => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingLabel(false);
              }}
              className="text-sm font-bold bg-white/[.06] border border-white/[.16] rounded-md px-1.5 py-0.5 outline-none focus:border-[#5b5bf6] w-full -ml-1.5"
            />
          ) : (
            <button type="button" onClick={startEditingLabel} className="group flex items-center gap-1.5 min-w-0 -ml-0.5">
              <p className="text-sm font-bold text-white truncate">{displayLabel}</p>
              <Pencil className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          )}
          <p className="text-[11px] text-gray-500">
            {isTrigger ? "Disparador" : "Acción"}
            {displayLabel !== NODE_TITLE[type] ? ` · ${NODE_TITLE[type]}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {type === "trigger.whatsapp_message" && (() => {
          const mediaFilter = node.data.mediaFilter === "image" || node.data.mediaFilter === "text" ? node.data.mediaFilter : "any";
          const staticExample = mediaFilter === "text" ? EXAMPLE_JSON_TEXT_EVENT : EXAMPLE_JSON_IMAGE_EVENT;
          const kindLabel = mediaFilter === "image" ? "imágenes" : mediaFilter === "text" ? "mensajes de texto" : "imágenes o mensajes de texto";
          const example = capturedExample ? prettyPrint(capturedExample.request_body) ?? staticExample : staticExample;
          const exampleLabel = capturedExample
            ? `Ver JSON real · capturado ${new Date(capturedExample.created_at).toLocaleString("es-CO")}`
            : "Ver ejemplo ilustrativo (sin datos reales aún)";

          return (
            <div>
              <InfoNote example={example} exampleLabel={exampleLabel} exampleIsReal={Boolean(capturedExample)}>
                Se activa cada vez que un cliente final envía {kindLabel} por WhatsApp.
              </InfoNote>
              <TestListenButton
                workflowId={workflowId}
                matches={e => whatsappEventMatches(e, mediaFilter)}
                onCaptured={setCapturedExample}
              />
              <div className="space-y-4">
                <SelectField
                  label="Se activa con"
                  value={mediaFilter}
                  onChange={v => onSetData({ mediaFilter: v as "image" | "text" | "any" })}
                  options={[
                    { value: "any", label: "Cualquiera — imagen o texto" },
                    { value: "image", label: "Solo imágenes" },
                    { value: "text", label: "Solo texto" }
                  ]}
                />
                <ChannelSelectField
                  channels={channels}
                  value={node.data.channelId}
                  onChange={channelId => onSetData({ channelId })}
                  kindLabel={kindLabel}
                />
              </div>
            </div>
          );
        })()}

        {type === "trigger.webhook" && (() => {
          const example = capturedExample ? prettyPrint(capturedExample.request_body) ?? EXAMPLE_JSON_REPLY_DEFAULT : EXAMPLE_JSON_REPLY_DEFAULT;
          const exampleLabel = capturedExample
            ? `Ver JSON real · capturado ${new Date(capturedExample.created_at).toLocaleString("es-CO")}`
            : "Ver ejemplo ilustrativo (sin datos reales aún)";

          return (
            <div>
              <InfoNote example={example} exampleLabel={exampleLabel} exampleIsReal={Boolean(capturedExample)}>
                Genera una URL pública única. Cualquier sistema externo — n8n, tu CRM, un backend propio — puede hacer un{" "}
                <code>POST</code> con JSON a esa URL para activar este workflow.
              </InfoNote>
              <TestListenButton workflowId={workflowId} matches={webhookEventMatches} onCaptured={setCapturedExample} />
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">URL del webhook</label>
              <div className="flex items-center gap-1.5 rounded-lg border border-white/[.12] bg-white/[.04] px-2.5 py-2">
                <code className="flex-1 text-[11px] text-gray-300 truncate">{webhookUrl}</code>
                <CopyButton value={webhookUrl} />
              </div>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Fija y única — no cambia aunque renombres el nodo, y nunca se repite entre workflows ni clientes.
                Para identificarla en tu lista, cámbiale el nombre con el lápiz junto al título de arriba.
              </p>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Conéctala a cualquier nodo de acción: <strong className="text-gray-300">Enviar mensaje de WhatsApp</strong> para
                responderle al cliente, o <strong className="text-gray-300">HTTP Request</strong> para reenviar el aviso a otro
                sistema — no es exclusiva de WhatsApp.
              </p>
            </div>
          );
        })()}

        {type === "action.webhook" && (
          <div>
            <InfoNote example={EXAMPLE_JSON_IMAGE_EVENT} exampleLabel="Ver ejemplo de JSON de salida (varía según el disparador conectado)">
              Llama por <code>POST</code> a la URL de un conector configurado en Conectores — n8n, Zapier, o cualquier
              backend propio que reciba JSON. No está atado a ninguna app en particular.
            </InfoNote>
            <SelectField
              label="Conexión"
              value={node.data.connectionId ?? ""}
              onChange={v => onSetData({ connectionId: v })}
              allowEmpty
              emptyLabel="Sin elegir"
              options={connections.map(c => ({ value: c.id, label: c.name }))}
            />
            {connections.length === 0 ? (
              <p className="text-[11px] text-gray-500 mt-2">
                Todavía no tienes conectores. <Link href="/dashboard/conectores" className="text-[#5b5bf6] hover:underline">Crea uno</Link>.
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                El JSON del disparador se envía a la URL de esta conexión. Si necesitas que el sistema externo
                responda de vuelta, agrega un nodo <strong className="text-gray-300">Webhook entrante</strong> aparte
                — cada conexión solo maneja la salida.
              </p>
            )}

            <div className="mt-5 pt-4 border-t border-white/[.08]">
              <ToggleField
                label="Personalizar solicitud"
                description="Por defecto Noova arma el JSON automáticamente. Actívalo para elegir el método, headers y el cuerpo exacto que se envía."
                checked={Boolean(node.data.customRequest)}
                onChange={customRequest => onSetData({ customRequest })}
              />

              {node.data.customRequest && (
                <div className="space-y-4 mt-4">
                  <SelectField
                    label="Método"
                    value={node.data.requestMethod ?? "POST"}
                    onChange={v => onSetData({ requestMethod: v })}
                    options={[
                      { value: "POST", label: "POST" },
                      { value: "PUT", label: "PUT" },
                      { value: "PATCH", label: "PATCH" }
                    ]}
                  />
                  <JsonTextareaField
                    label="Cuerpo (JSON)"
                    value={node.data.requestBodyTemplate}
                    onChange={requestBodyTemplate => onSetData({ requestBodyTemplate })}
                    placeholder={'{\n  "id": "{{conversation_id}}",\n  "texto": "{{message_text}}"\n}'}
                    rows={6}
                  />
                  <JsonTextareaField
                    label="Headers extra (JSON, opcional)"
                    value={node.data.requestHeadersJson}
                    onChange={requestHeadersJson => onSetData({ requestHeadersJson })}
                    placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
                    rows={3}
                  />
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Variables disponibles — deben ir dentro de las comillas del JSON: <code>{"{{conversation_id}}"}</code>,{" "}
                    <code>{"{{contact_phone}}"}</code>, <code>{"{{contact_label}}"}</code>, <code>{"{{message_text}}"}</code>,{" "}
                    <code>{"{{image_url}}"}</code>. La firma HMAC y{" "}
                    <code>Content-Type</code> se agregan siempre, sin importar los headers que pongas aquí.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {type === "action.send_whatsapp_message" && (() => {
          const messageType = node.data.messageType === "template" || node.data.messageType === "media" ? node.data.messageType : "text";
          const example =
            messageType === "template" ? EXAMPLE_JSON_REPLY_TEMPLATE : messageType === "media" ? EXAMPLE_JSON_REPLY_MEDIA : EXAMPLE_JSON_REPLY_DEFAULT;
          const selectedTemplate = templates.find(t => t.id === node.data.templateId);

          return (
            <div>
              <InfoNote example={example} exampleLabel="Ver ejemplo de JSON que espera recibir">
                Conéctalo a un nodo <strong className="text-white">Webhook entrante</strong>. Cuando llegue el JSON, Noova
                envía el mensaje elegido por WhatsApp en el chat de esa conversación.
              </InfoNote>
              <div className="space-y-4">
                <SelectField
                  label="Tipo de mensaje"
                  value={messageType}
                  onChange={v => onSetData({ messageType: v as "text" | "template" | "media" })}
                  options={[
                    { value: "text", label: "Texto" },
                    { value: "template", label: "Plantilla (HSM)" },
                    { value: "media", label: "Imagen / Documento" }
                  ]}
                />

                <JsonPathField
                  label="Campo con el ID de la conversación"
                  value={node.data.conversationIdPath}
                  onChange={conversationIdPath => onSetData({ conversationIdPath })}
                  placeholder="conversation_id"
                />

                {messageType === "text" && (
                  <JsonPathField
                    label="Campo con el texto a enviar"
                    value={node.data.messageTextPath}
                    onChange={messageTextPath => onSetData({ messageTextPath })}
                    placeholder="reply.text"
                  />
                )}

                {messageType === "template" && (
                  <>
                    <div>
                      <SelectField
                        label="Plantilla"
                        value={node.data.templateId ?? ""}
                        onChange={v => onSetData({ templateId: v })}
                        allowEmpty
                        emptyLabel="Sin elegir"
                        options={templates.map(t => ({ value: t.id, label: `${t.template_name} · ${t.channel_label}` }))}
                      />
                      {templates.length === 0 ? (
                        <p className="text-[11px] text-gray-500 mt-2">
                          Todavía no tienes plantillas aprobadas. <Link href="/dashboard/canales/whatsapp" className="text-[#5b5bf6] hover:underline">Créalas en Canales</Link>.
                        </p>
                      ) : selectedTemplate ? (
                        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                          &ldquo;{selectedTemplate.body_preview}&rdquo; — espera {selectedTemplate.variable_labels.length} variable(s), en ese orden.
                        </p>
                      ) : null}
                    </div>
                    <JsonPathField
                      label="Campo con las variables (arreglo, en orden)"
                      value={node.data.variablesPath}
                      onChange={variablesPath => onSetData({ variablesPath })}
                      placeholder="variables"
                    />
                  </>
                )}

                {messageType === "media" && (
                  <>
                    <SelectField
                      label="Tipo de archivo"
                      value={node.data.mediaType ?? "image"}
                      onChange={v => onSetData({ mediaType: v as "image" | "document" })}
                      options={[
                        { value: "image", label: "Imagen" },
                        { value: "document", label: "Documento" }
                      ]}
                    />
                    <JsonPathField
                      label="Campo con la URL del archivo"
                      value={node.data.mediaUrlPath}
                      onChange={mediaUrlPath => onSetData({ mediaUrlPath })}
                      placeholder="media.url"
                    />
                    <JsonPathField
                      label="Campo con el texto/caption (opcional)"
                      value={node.data.captionPath}
                      onChange={captionPath => onSetData({ captionPath })}
                      placeholder="media.caption"
                    />
                  </>
                )}

                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Rutas dentro del JSON recibido, separadas por puntos — ej. <code>reply.text</code> lee{" "}
                  <code>{"{ reply: { text: \"...\" } }"}</code>. Si las dejas vacías usa esos mismos nombres por defecto.
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

