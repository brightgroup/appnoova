/**
 * Tipos de nodo soportados por el motor de ejecución (backend) y catálogo para
 * la paleta del editor (frontend). El editor de workflows es un canvas
 * genérico (cualquier arreglo de nodos/aristas), pero en Fase 1 el motor solo
 * sabe ejecutar esta combinación puntual: trigger.whatsapp_image → conectado a →
 * action.webhook. Nuevos tipos se agregan aquí sin tocar el resto del motor.
 */

export const NODE_TYPES = [
  "trigger.whatsapp_image",
  "action.webhook",
  "result.whatsapp_reply"
] as const;

export type WorkflowNodeType = (typeof NODE_TYPES)[number];

export interface WorkflowNodeData {
  /** Solo aplica a action.webhook: qué automation_connection usar al ejecutar. */
  connectionId?: string;
  [key: string]: unknown;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

export interface NodeCatalogEntry {
  type: WorkflowNodeType;
  /** n8n/Zapier/Make solo distinguen disparador vs acción — no hay una categoría "resultado". */
  category: "trigger" | "action";
  label: string;
  description: string;
}

/** Catálogo para la paleta "Agregar nodo" del editor — hoy pocas opciones, pensado para crecer. */
export const NODE_CATALOG: NodeCatalogEntry[] = [
  {
    type: "trigger.whatsapp_image",
    category: "trigger",
    label: "Imagen recibida",
    description: "WhatsApp · cualquier canal"
  },
  {
    type: "action.webhook",
    category: "action",
    label: "Enviar a conector",
    description: "Webhook saliente (n8n y similares)"
  },
  {
    type: "result.whatsapp_reply",
    category: "action",
    label: "Responder al cliente",
    description: "Mismo chat de WhatsApp, cuando el conector responda"
  }
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valida/normaliza un grafo recibido del cliente antes de guardarlo. */
export function normalizeWorkflowGraph(input: unknown): WorkflowGraph {
  if (!isPlainObject(input)) return { ...EMPTY_GRAPH };

  const rawNodes = Array.isArray((input as { nodes?: unknown }).nodes)
    ? ((input as { nodes: unknown[] }).nodes)
    : [];
  const rawEdges = Array.isArray((input as { edges?: unknown }).edges)
    ? ((input as { edges: unknown[] }).edges)
    : [];

  const nodes: WorkflowNode[] = rawNodes
    .filter(isPlainObject)
    .filter((n) => typeof n.id === "string" && NODE_TYPES.includes(n.type as WorkflowNodeType))
    .map((n) => ({
      id: n.id as string,
      type: n.type as WorkflowNodeType,
      position: {
        x: Number((n.position as { x?: unknown } | undefined)?.x ?? 0),
        y: Number((n.position as { y?: unknown } | undefined)?.y ?? 0)
      },
      data: isPlainObject(n.data) ? (n.data as WorkflowNodeData) : {}
    }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: WorkflowEdge[] = rawEdges
    .filter(isPlainObject)
    .filter(
      (e) =>
        typeof e.id === "string" &&
        typeof e.source === "string" &&
        typeof e.target === "string" &&
        nodeIds.has(e.source as string) &&
        nodeIds.has(e.target as string) &&
        e.source !== e.target
    )
    .map((e) => ({ id: e.id as string, source: e.source as string, target: e.target as string }));

  return { nodes, edges };
}

/**
 * Recorre el grafo buscando nodos `trigger.whatsapp_image` conectados (por una
 * arista, directa) a un nodo `action.webhook`, y devuelve el/los connectionId
 * configurados. Es el único recorrido que el motor de ejecución entiende hoy.
 */
export function findWebhookActionConnectionIds(graph: WorkflowGraph): string[] {
  const triggerIds = new Set(
    graph.nodes.filter((n) => n.type === "trigger.whatsapp_image").map((n) => n.id)
  );
  if (triggerIds.size === 0) return [];

  const actionNodesById = new Map(
    graph.nodes.filter((n) => n.type === "action.webhook").map((n) => [n.id, n])
  );

  const connectionIds: string[] = [];
  for (const edge of graph.edges) {
    if (!triggerIds.has(edge.source)) continue;
    const action = actionNodesById.get(edge.target);
    const connectionId = action?.data.connectionId;
    if (typeof connectionId === "string" && connectionId) {
      connectionIds.push(connectionId);
    }
  }
  return [...new Set(connectionIds)];
}
