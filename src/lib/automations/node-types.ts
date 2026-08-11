/**
 * Tipos de nodo soportados por el motor de ejecución (backend) y catálogo para
 * la paleta del editor (frontend). El editor de workflows es un canvas
 * genérico (cualquier arreglo de nodos/aristas), pero en Fase 1 el motor solo
 * sabe ejecutar esta combinación puntual: trigger.whatsapp_image → conectado a →
 * action.webhook. Nuevos tipos se agregan aquí sin tocar el resto del motor.
 */

export const NODE_TYPES = [
  "trigger.whatsapp_image",
  "trigger.whatsapp_text",
  "trigger.webhook",
  "action.webhook",
  "action.send_whatsapp_message"
] as const;

/** Disparadores de WhatsApp — comparten selector de canal y motor de emisión (ver events.ts). */
export const WHATSAPP_TRIGGER_TYPES = ["trigger.whatsapp_image", "trigger.whatsapp_text"] as const;

export type WorkflowNodeType = (typeof NODE_TYPES)[number];

export interface WorkflowNodeData {
  /** Solo aplica a action.webhook: qué automation_connection usar al ejecutar. */
  connectionId?: string;
  /** Solo aplica a los disparadores de WhatsApp: id del whatsapp_channels a escuchar. Vacío/ausente = cualquier canal de la org. */
  channelId?: string;
  /** Solo aplica a trigger.webhook: token único de este nodo — la URL pública es /api/automations/inbound/{webhookToken}. Se genera al crear el nodo. */
  webhookToken?: string;
  /** Solo aplican a action.send_whatsapp_message: dot-path dentro del JSON entrante. Vacío = usa el default ("conversation_id"/"reply.text"). */
  conversationIdPath?: string;
  messageTextPath?: string;
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
    label: "Imagen de WhatsApp recibida",
    description: "WhatsApp · elige el canal"
  },
  {
    type: "trigger.whatsapp_text",
    category: "trigger",
    label: "Mensaje de WhatsApp recibido",
    description: "WhatsApp · elige el canal"
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    label: "Webhook entrante",
    description: "Genera una URL propia — cualquier sistema externo puede llamarla"
  },
  {
    type: "action.webhook",
    category: "action",
    label: "HTTP Request",
    description: "Llama a la URL de un conector (n8n y similares)"
  },
  {
    type: "action.send_whatsapp_message",
    category: "action",
    label: "Enviar mensaje de WhatsApp",
    description: "Responde en el mismo chat del cliente final"
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
 * Recorre el grafo buscando nodos disparadores de WhatsApp (imagen o texto)
 * conectados por una arista directa a un nodo `action.webhook`, y devuelve
 * el/los connectionId configurados.
 *
 * `channelId` es el canal de WhatsApp que recibió el mensaje real: un
 * disparador sin `data.channelId` configurado dispara para cualquier canal
 * (comportamiento por defecto/retrocompatible); uno con `channelId` solo
 * dispara si coincide.
 */
export function findWebhookActionConnectionIds(
  graph: WorkflowGraph,
  triggerType: (typeof WHATSAPP_TRIGGER_TYPES)[number],
  channelId?: string
): string[] {
  const triggerIds = new Set(
    graph.nodes
      .filter((n) => n.type === triggerType)
      .filter((n) => !n.data.channelId || n.data.channelId === channelId)
      .map((n) => n.id)
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

/**
 * Asigna un `webhookToken` a cualquier nodo `trigger.webhook` que aún no
 * tenga uno (el editor ya lo genera al crear el nodo — esto es solo un
 * resguardo del lado del servidor antes de persistir el grafo).
 */
export function ensureWebhookTokens(graph: WorkflowGraph): WorkflowGraph {
  let changed = false;
  const nodes = graph.nodes.map((n) => {
    if (n.type !== "trigger.webhook" || (typeof n.data.webhookToken === "string" && n.data.webhookToken)) {
      return n;
    }
    changed = true;
    return { ...n, data: { ...n.data, webhookToken: crypto.randomUUID().replace(/-/g, "") } };
  });
  return changed ? { ...graph, nodes } : graph;
}

export interface SendMessageTarget {
  conversationIdPath: string;
  messageTextPath: string;
}

/**
 * Recorre el grafo desde un nodo `trigger.webhook` (por su id) buscando
 * nodos `action.send_whatsapp_message` conectados por una arista directa, y
 * devuelve cómo extraer conversation_id/texto del JSON que llegue a esa URL.
 */
export function findSendMessageTargets(graph: WorkflowGraph, triggerNodeId: string): SendMessageTarget[] {
  const actionNodesById = new Map(
    graph.nodes.filter((n) => n.type === "action.send_whatsapp_message").map((n) => [n.id, n])
  );

  const targets: SendMessageTarget[] = [];
  for (const edge of graph.edges) {
    if (edge.source !== triggerNodeId) continue;
    const action = actionNodesById.get(edge.target);
    if (!action) continue;
    targets.push({
      conversationIdPath:
        typeof action.data.conversationIdPath === "string" && action.data.conversationIdPath
          ? action.data.conversationIdPath
          : "conversation_id",
      messageTextPath:
        typeof action.data.messageTextPath === "string" && action.data.messageTextPath
          ? action.data.messageTextPath
          : "reply.text"
    });
  }
  return targets;
}

/** Lee un valor por dot-path (`"reply.text"`) de un JSON arbitrario recibido en un webhook entrante. */
export function resolveJsonPath(body: unknown, path: string): string | undefined {
  let current: unknown = body;
  for (const part of path.split(".").filter(Boolean)) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") return String(current);
  return undefined;
}
