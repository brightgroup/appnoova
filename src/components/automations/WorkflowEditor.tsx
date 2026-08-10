"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, Loader2, Plus, Save, CheckCircle2, Search, Reply, X, Info } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { tabActive, tabIdle } from "@/lib/brand-ui";
import { Badge } from "@/components/ui/Badge";
import { ConnectionsContext, NODE_BRAND_COLOR, WORKFLOW_NODE_TYPES } from "@/components/automations/workflow-nodes";
import { N8nLogo } from "@/components/icons/brands/N8nLogo";
import { WhatsAppLogo } from "@/components/icons/brands/WhatsAppLogo";
import { NODE_CATALOG, type WorkflowNodeType, type WorkflowNodeData } from "@/lib/automations/node-types";
import type { WorkflowRecord } from "@/lib/automations/workflows-db";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";

type Tab = "editor" | "ejecuciones";

const TABS: { id: Tab; label: string }[] = [
  { id: "editor", label: "Editor" },
  { id: "ejecuciones", label: "Ejecuciones" }
];

const NODE_PICKER_ICON: Record<WorkflowNodeType, React.ReactNode> = {
  "trigger.whatsapp_image": <WhatsAppLogo className="w-4 h-4 text-white" />,
  "action.webhook": <N8nLogo className="w-4 h-4 text-white" />,
  "result.whatsapp_reply": <Reply className="w-4 h-4 text-white" strokeWidth={1.8} />
};

const NODE_TITLE: Record<WorkflowNodeType, string> = {
  "trigger.whatsapp_image": "Imagen recibida",
  "action.webhook": "Enviar a conector",
  "result.whatsapp_reply": "Responder al cliente"
};

interface AutomationEventRow {
  id: string;
  event_type: string;
  status: "sent" | "responded" | "no_response" | "error";
  latency_ms: number | null;
  created_at: string;
}

export function WorkflowEditor({ workflowId, initialTab }: { workflowId: string; initialTab?: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab === "ejecuciones" ? "ejecuciones" : "editor");
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [connections, setConnections] = useState<AutomationConnectionRecord[]>([]);
  const [events, setEvents] = useState<AutomationEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);

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
    const [wfRes, connRes, evRes] = await Promise.all([
      authFetch(`/api/automations/workflows/${workflowId}`),
      authFetch("/api/automations/connections"),
      authFetch(`/api/automations/workflows/${workflowId}/events`)
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
    setNodes(nds => [
      ...nds,
      { id, type, position: { x: 60 + nds.length * 230, y: 160 }, data: {} }
    ]);
    setSaved(false);
    setPaletteOpen(false);
    setPaletteSearch("");
  }

  const configNode = useMemo(() => nodes.find(n => n.id === configNodeId) ?? null, [nodes, configNodeId]);

  function setNodeConnection(nodeId: string, connectionId: string) {
    setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, connectionId } } : n)));
    setSaved(false);
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
              <h1 className="text-lg font-bold truncate">{workflow.name}</h1>
              {workflow.status === "active" ? <Badge variant="emerald">Activo</Badge> : <Badge variant="neutral">Pausado</Badge>}
            </div>
            <p className="text-xs text-gray-400">
              {events.length} ejecuciones registradas{!saved && " · Sin guardar"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || saved}
          className="inline-flex items-center gap-2 rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

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
                  <h3 className="text-sm font-bold text-white">¿Qué pasa después?</h3>
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
                node={configNode}
                connections={connections}
                onClose={() => setConfigNodeId(null)}
                onSetConnection={connectionId => setNodeConnection(configNode.id, connectionId)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <EventsTable events={events} />
        </div>
      )}
    </div>
  );
}

function NodeConfigPanel({
  node,
  connections,
  onClose,
  onSetConnection
}: {
  node: Node<WorkflowNodeData>;
  connections: AutomationConnectionRecord[];
  onClose: () => void;
  onSetConnection: (connectionId: string) => void;
}) {
  const type = node.type as WorkflowNodeType;
  const color = NODE_BRAND_COLOR[type];

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[.08] shrink-0">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
          {NODE_PICKER_ICON[type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{NODE_TITLE[type]}</p>
          <p className="text-[11px] text-gray-500">{type === "trigger.whatsapp_image" ? "Disparador" : "Acción"}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {type === "trigger.whatsapp_image" && (
          <div className="flex gap-2.5 p-3 rounded-lg bg-white/[.03] border border-white/[.08] text-xs text-gray-300 leading-relaxed">
            <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            Este workflow se activa cada vez que un cliente final envía una imagen por WhatsApp a
            cualquiera de tus canales conectados. No tiene configuración adicional.
          </div>
        )}

        {type === "action.webhook" && (
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Conexión</label>
            <select
              value={node.data.connectionId ?? ""}
              onChange={e => onSetConnection(e.target.value)}
              className="w-full rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white"
            >
              <option value="">Sin elegir</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {connections.length === 0 ? (
              <p className="text-[11px] text-gray-500 mt-2">
                Todavía no tienes conectores. <Link href="/dashboard/conectores" className="text-[#5b5bf6] hover:underline">Crea uno</Link>.
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                El JSON con el análisis de la imagen se envía a la URL del webhook de esta conexión.
              </p>
            )}
          </div>
        )}

        {type === "result.whatsapp_reply" && (
          <div className="flex gap-2.5 p-3 rounded-lg bg-white/[.03] border border-white/[.08] text-xs text-gray-300 leading-relaxed">
            <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
            Cuando tu conector llame a la URL de callback con la respuesta, Noova la reenvía por
            WhatsApp al cliente final — en el mismo chat. No tiene configuración adicional.
          </div>
        )}
      </div>
    </>
  );
}

function EventsTable({ events }: { events: AutomationEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">Sin ejecuciones todavía.</p>;
  }
  return (
    <div className="rounded-xl border border-white/[.08] overflow-hidden max-w-3xl">
      <table className="w-full text-xs">
        <thead className="bg-white/[.03]">
          <tr className="border-b border-white/[.08]">
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Evento</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Estado</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Latencia</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id} className="border-b border-white/[.06] last:border-0 hover:bg-white/[.03]">
              <td className="px-4 py-3 text-gray-200">{e.event_type}</td>
              <td className="px-4 py-3">
                {e.status === "sent" || e.status === "responded" ? (
                  <Badge variant="emerald" icon={CheckCircle2}>Respuesta recibida</Badge>
                ) : e.status === "error" ? (
                  <Badge variant="danger">Sin conexión</Badge>
                ) : (
                  <Badge variant="neutral">Sin respuesta aún</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-gray-400 tabular-nums">{e.latency_ms ? `${(e.latency_ms / 1000).toFixed(1)} s` : "—"}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-CO")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
