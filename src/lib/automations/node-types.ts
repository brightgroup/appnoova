/**
 * Tipos de nodo soportados por el motor de ejecución (backend) y catálogo para
 * la paleta del editor (frontend). El editor de workflows es un canvas
 * genérico (cualquier arreglo de nodos/aristas), pero en Fase 1 el motor solo
 * sabe ejecutar esta combinación puntual: trigger.whatsapp_image → conectado a →
 * action.webhook. Nuevos tipos se agregan aquí sin tocar el resto del motor.
 */

import { readExtractSchema, type ExtractFieldDef } from "@/lib/automations/extract-schema";
export type { ExtractFieldDef, ExtractFieldType } from "@/lib/automations/extract-schema";

export const NODE_TYPES = [
  "trigger.whatsapp_message",
  "trigger.webhook",
  "trigger.hubspot_message",
  "action.ai_extract",
  "action.webhook",
  "action.send_whatsapp_message",
  "action.hubspot_greeting"
] as const;

export type WorkflowNodeType = (typeof NODE_TYPES)[number];

/** Qué disparó realmente el evento — no es un tipo de nodo, es el hecho real (llegó una imagen, un documento/PDF, o un texto). */
export type WhatsAppEventMediaType = "image" | "document" | "text";

export interface WorkflowNodeData {
  /** Nombre propio puesto por el usuario — si está, siempre gana sobre cualquier etiqueta calculada (canal/conexión/default). */
  label?: string;
  /** Solo aplica a action.webhook: qué automation_connection usar al ejecutar. */
  connectionId?: string;
  /** Solo aplica a action.webhook: si está activo, se usa method/headers/body personalizados en vez del payload automático. */
  customRequest?: boolean;
  /** Solo aplica a action.webhook con customRequest activo. Default "POST". */
  requestMethod?: string;
  /** Solo aplica a action.webhook con customRequest activo: JSON de headers extra, como texto (admite tokens {{...}}). */
  requestHeadersJson?: string;
  /** Solo aplica a action.webhook con customRequest activo: JSON del cuerpo, como texto (admite tokens {{...}}), reemplaza el payload automático. */
  requestBodyTemplate?: string;
  /** Solo aplica al disparador de WhatsApp: id del whatsapp_channels a escuchar. Vacío/ausente = cualquier canal de la org. */
  channelId?: string;
  /** Solo aplica a trigger.whatsapp_message: qué lo activa. Default "any" (imagen, documento/PDF o texto). */
  mediaFilter?: "image" | "document" | "text" | "any";
  /**
   * @deprecated Vive en el nodo `action.ai_extract` conectado, no en el trigger. Solo se lee acá
   * para migrar workflows guardados antes de separar la extracción en su propio nodo — ver
   * `ensureAiExtractNodes`. No usar en código nuevo.
   */
  extractFields?: boolean;
  /**
   * Forma del JSON a extraer con IA, definida por el tenant (nombre + tipo + instrucción por
   * campo, con anidamiento). Vive en `action.ai_extract`; en `trigger.whatsapp_message` solo
   * aparece en workflows guardados antes de la migración (ver `extractFields` arriba).
   */
  extractSchema?: ExtractFieldDef[];
  /** Solo aplica a action.ai_extract: modelo que analiza el archivo/texto y arma el JSON — mismo espacio de ids que resolveEngineChain/billing (ej. "gemini-2.5-flash", "claude-sonnet-5"), pero con catálogo propio (AI_EXTRACT_MODEL_OPTIONS en WorkflowEditor.tsx) que sí incluye Sonnet — a diferencia de TEXT_LLM_MODELS, que ya no lo ofrece en la conversación con el cliente. Default "gemini-2.5-flash". */
  aiModel?: string;
  /** Solo aplica a action.ai_extract: instrucciones generales del tenant que aplican a toda la extracción (tono, prioridades, cómo resolver ambigüedades) — distinto de `instruction` por campo en `extractSchema`, que es puntual a un dato. Se inyecta en el prompt del sistema, ver runFieldExtraction en extract.ts. */
  generalInstruction?: string;
  /** Solo aplica a trigger.webhook: token único de este nodo — la URL pública es /api/automations/inbound/{webhookToken}. Se genera al crear el nodo. */
  webhookToken?: string;
  /** Solo aplica a action.send_whatsapp_message: qué tipo de contenido envía. Default "text". */
  messageType?: "text" | "template" | "media";
  /** Solo aplican a action.send_whatsapp_message: dot-path dentro del JSON entrante. Vacío = usa el default ("conversation_id"/"reply.text"). */
  conversationIdPath?: string;
  messageTextPath?: string;
  /** Solo aplica a messageType "template": id de whatsapp_templates elegido en el editor. */
  templateId?: string;
  /** Solo aplica a messageType "template": dot-path a un arreglo de variables (en el orden de la plantilla) dentro del JSON entrante. Default "variables". */
  variablesPath?: string;
  /** Solo aplica a messageType "media": tipo de archivo a enviar. Default "image". */
  mediaType?: "image" | "document";
  /** Solo aplica a messageType "media": dot-path a la URL del archivo dentro del JSON entrante. Default "media.url". */
  mediaUrlPath?: string;
  /** Solo aplica a messageType "media": dot-path al texto/caption opcional dentro del JSON entrante. Default "media.caption". */
  captionPath?: string;
  /** Solo aplica a trigger.hubspot_message: token único de este nodo — la URL pública es /api/automations/hubspot/{webhookToken}. Se genera al crear el nodo. */
  hubspotWebhookToken?: string;
  /** Solo aplica a trigger.hubspot_message: ids de bandejas (inboxId) de HubSpot a escuchar. Vacío/ausente = cualquier bandeja del portal. */
  hubspotInboxIds?: string[];
  /** Solo aplica a action.hubspot_greeting: texto del saludo a publicar en el hilo. */
  hubspotGreetingText?: string;
  /** Solo aplica a action.hubspot_greeting: actor que HubSpot usa para firmar el mensaje en Conversaciones (formato "A-XXXXXX" de una app, o el actor con el que respondes manualmente en ese hilo). */
  hubspotSenderActorId?: string;
  /** Solo aplica a action.hubspot_greeting: si es false, saluda en cualquier mensaje entrante que aplique, no solo el primero del hilo. Default true. */
  hubspotOnlyFirstMessage?: boolean;
  /** Solo aplica a action.hubspot_greeting: si no existe un contacto con ese teléfono, lo crea antes de saludar. Default true. */
  hubspotCreateContactIfMissing?: boolean;
  /** Solo aplica a action.hubspot_greeting con hubspotCreateContactIfMissing activo: dominio para el email placeholder que exige HubSpot cuando no hay email real (ej. "telefono@dominio"). Default "whatsapp.sin-correo.com". */
  hubspotPlaceholderEmailDomain?: string;
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
    type: "trigger.whatsapp_message",
    category: "trigger",
    label: "Mensaje de WhatsApp recibido",
    description: "Imagen o texto · elige el canal y qué lo activa"
  },
  {
    type: "trigger.webhook",
    category: "trigger",
    label: "Webhook entrante",
    description: "Genera una URL propia — cualquier sistema externo puede llamarla"
  },
  {
    type: "trigger.hubspot_message",
    category: "trigger",
    label: "Mensaje recibido en HubSpot",
    description: "Elige las bandejas de Conversaciones a escuchar — requiere HubSpot conectado"
  },
  {
    type: "action.ai_extract",
    category: "action",
    label: "IA",
    description: "Analiza el archivo o mensaje con el modelo que elijas — hoy extrae datos estructurados, más adelante otras acciones"
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
  },
  {
    type: "action.hubspot_greeting",
    category: "action",
    label: "Saludo automático HubSpot",
    description: "Valida/crea el contacto y responde en el hilo — solo en el primer mensaje, si así lo eliges"
  }
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Tipos de nodo que existieron antes de unificar el disparador de WhatsApp — se migran solos al cargar/guardar, sin romper workflows ya guardados. */
const LEGACY_NODE_TYPE_MIGRATIONS: Record<string, { type: WorkflowNodeType; data: Partial<WorkflowNodeData> }> = {
  "trigger.whatsapp_image": { type: "trigger.whatsapp_message", data: { mediaFilter: "image" } },
  "trigger.whatsapp_text": { type: "trigger.whatsapp_message", data: { mediaFilter: "text" } }
};

/** Modelo con el que SIEMPRE corrió la extracción antes de que tuviera nodo propio (Gemini fijo, sin excepción) — es el que toma un workflow migrado, para no cambiarle en silencio el JSON de salida a nadie que ya esté en producción. */
const DEFAULT_AI_EXTRACT_MODEL = "gemini-2.5-flash";

/**
 * Antes de que la extracción con IA tuviera su propio nodo, vivía como config
 * pegada al trigger (`extractFields`/`extractSchema`). Esta función migra esos
 * workflows en memoria, insertando un nodo `action.ai_extract` conectado entre
 * el trigger y los nodos a los que ya apuntaba — mismo patrón que
 * `ensureWebhookTokens` (idempotente, vía el flag `changed`), pero mutando
 * nodos Y aristas en vez de solo `data`.
 */
function ensureAiExtractNodes(graph: WorkflowGraph): WorkflowGraph {
  let changed = false;
  const nodes = [...graph.nodes];
  let edges = [...graph.edges];

  for (const trigger of graph.nodes) {
    if (trigger.type !== "trigger.whatsapp_message" || trigger.data.extractFields !== true) continue;

    const alreadyConnected = edges.some(
      (e) => e.source === trigger.id && nodes.find((n) => n.id === e.target)?.type === "action.ai_extract"
    );
    if (alreadyConnected) continue;

    changed = true;
    const newNodeId = `ai_extract_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

    nodes.push({
      id: newNodeId,
      type: "action.ai_extract",
      position: { x: trigger.position.x + 260, y: trigger.position.y },
      data: { aiModel: DEFAULT_AI_EXTRACT_MODEL, extractSchema: trigger.data.extractSchema }
    });

    // Las aristas que salían directo del trigger ahora salen del nodo nuevo —
    // el trigger pasa a apuntar solo a la extracción, que sigue hacia donde
    // sea que apuntaba antes (típicamente un action.webhook).
    edges = edges.map((e) => (e.source === trigger.id ? { ...e, source: newNodeId } : e));
    edges.push({ id: `e_${trigger.id}_${newNodeId}`, source: trigger.id, target: newNodeId });

    const triggerIdx = nodes.findIndex((n) => n.id === trigger.id);
    nodes[triggerIdx] = {
      ...nodes[triggerIdx],
      data: { ...nodes[triggerIdx].data, extractFields: undefined, extractSchema: undefined }
    };
  }

  return changed ? { nodes, edges } : graph;
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
    .map((n) => {
      const migration = LEGACY_NODE_TYPE_MIGRATIONS[n.type as string];
      if (!migration) return n;
      return { ...n, type: migration.type, data: { ...migration.data, ...(isPlainObject(n.data) ? n.data : {}) } };
    })
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

  return ensureAiExtractNodes({ nodes, edges });
}

export interface WebhookActionConfig {
  connectionId: string;
  /** Si es false, el motor arma el payload automático (comportamiento por defecto, sin fricción). */
  customRequest: boolean;
  requestMethod: string;
  requestHeadersJson?: string;
  requestBodyTemplate?: string;
}

/**
 * Ids de los nodos `trigger.whatsapp_message` que aplican para un evento real
 * (canal + si llegó imagen o texto, contra `mediaFilter`). Se usa tanto para
 * saber a qué conectores avisar como para loguear el evento como "captured"
 * aunque el disparador todavía no esté conectado a nada — así el botón
 * "Escuchar evento de prueba" del editor funciona desde el primer momento.
 *
 * `channelId` es el canal de WhatsApp que recibió el mensaje real: un
 * disparador sin `data.channelId` configurado dispara para cualquier canal
 * (comportamiento por defecto); uno con `channelId` solo dispara si coincide.
 */
export function findMatchingWhatsAppTriggerNodeIds(
  graph: WorkflowGraph,
  eventMediaType: WhatsAppEventMediaType,
  channelId?: string
): string[] {
  return graph.nodes
    .filter((n) => n.type === "trigger.whatsapp_message")
    .filter((n) => !n.data.channelId || n.data.channelId === channelId)
    .filter((n) => !n.data.mediaFilter || n.data.mediaFilter === "any" || n.data.mediaFilter === eventMediaType)
    .map((n) => n.id);
}

/**
 * Configuración del nodo `action.ai_extract` conectado directo a este
 * disparador (si lo hay) — campos a extraer + modelo elegido para esa
 * extracción. `null` si el disparador no tiene ningún nodo de extracción
 * conectado, o si no definió ningún campo.
 */
export function getConnectedAiExtractConfig(
  graph: WorkflowGraph,
  triggerNodeId: string
): { fields: ExtractFieldDef[]; model: string; generalInstruction?: string } | null {
  const extractNodeId = graph.edges.find(
    (e) => e.source === triggerNodeId && graph.nodes.find((n) => n.id === e.target)?.type === "action.ai_extract"
  )?.target;
  if (!extractNodeId) return null;

  const node = graph.nodes.find((n) => n.id === extractNodeId);
  if (!node) return null;
  const fields = readExtractSchema(node.data.extractSchema);
  if (fields.length === 0) return null;
  const model = typeof node.data.aiModel === "string" && node.data.aiModel ? node.data.aiModel : DEFAULT_AI_EXTRACT_MODEL;
  const generalInstruction = typeof node.data.generalInstruction === "string" ? node.data.generalInstruction.trim() : "";
  return { fields, model, generalInstruction: generalInstruction || undefined };
}

/**
 * Recorre el grafo buscando nodos disparadores de WhatsApp que apliquen a
 * este evento, conectados a un nodo `action.webhook` — directo, o a través de
 * un nodo `action.ai_extract` intermedio (trigger → ai_extract → webhook,
 * la forma que arma el editor cuando el workflow extrae campos con IA) — y
 * devuelve la configuración de cada uno (conexión + si tiene solicitud
 * personalizada).
 *
 * El motor sigue siendo de 1 salto por diseño (ver comentario de archivo):
 * esto no es un recorrido BFS genérico, solo "ve a través" del único tipo de
 * nodo intermedio que existe hoy.
 */
export function findWebhookActionConfigs(
  graph: WorkflowGraph,
  eventMediaType: WhatsAppEventMediaType,
  channelId?: string
): WebhookActionConfig[] {
  const triggerIds = new Set(findMatchingWhatsAppTriggerNodeIds(graph, eventMediaType, channelId));
  if (triggerIds.size === 0) return [];

  const effectiveSourceIds = new Set(triggerIds);
  for (const edge of graph.edges) {
    if (!triggerIds.has(edge.source)) continue;
    const target = graph.nodes.find((n) => n.id === edge.target);
    if (target?.type === "action.ai_extract") effectiveSourceIds.add(target.id);
  }

  const actionNodesById = new Map(
    graph.nodes.filter((n) => n.type === "action.webhook").map((n) => [n.id, n])
  );

  const seenActionIds = new Set<string>();
  const configs: WebhookActionConfig[] = [];
  for (const edge of graph.edges) {
    if (!effectiveSourceIds.has(edge.source)) continue;
    const action = actionNodesById.get(edge.target);
    const connectionId = action?.data.connectionId;
    if (!action || typeof connectionId !== "string" || !connectionId) continue;
    if (seenActionIds.has(action.id)) continue;
    seenActionIds.add(action.id);
    configs.push({
      connectionId,
      customRequest: Boolean(action.data.customRequest),
      requestMethod:
        typeof action.data.requestMethod === "string" && action.data.requestMethod ? action.data.requestMethod : "POST",
      requestHeadersJson: typeof action.data.requestHeadersJson === "string" ? action.data.requestHeadersJson : undefined,
      requestBodyTemplate: typeof action.data.requestBodyTemplate === "string" ? action.data.requestBodyTemplate : undefined
    });
  }
  return configs;
}

/**
 * Asigna el token de URL pública a cualquier nodo `trigger.webhook` o
 * `trigger.hubspot_message` que aún no tenga uno (el editor ya lo genera al
 * crear el nodo — esto es solo un resguardo del lado del servidor antes de
 * persistir el grafo). Cada tipo guarda su token en su propio campo
 * (`webhookToken` / `hubspotWebhookToken`) porque son URLs de callback
 * distintas (`/api/automations/inbound/...` vs `/api/automations/hubspot/...`).
 */
/** Mismo formato que valida el campo del editor — letras, números, punto, guion y guion bajo. */
const VALID_WEBHOOK_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

const TOKEN_FIELD_BY_TRIGGER_TYPE: Partial<Record<WorkflowNodeType, keyof WorkflowNodeData>> = {
  "trigger.webhook": "webhookToken",
  "trigger.hubspot_message": "hubspotWebhookToken"
};

export function ensureWebhookTokens(graph: WorkflowGraph): WorkflowGraph {
  let changed = false;
  const nodes = graph.nodes.map((n) => {
    const field = TOKEN_FIELD_BY_TRIGGER_TYPE[n.type];
    if (!field) return n;
    const token = n.data[field];
    if (typeof token === "string" && VALID_WEBHOOK_SLUG.test(token)) return n;
    changed = true;
    return { ...n, data: { ...n.data, [field]: crypto.randomUUID().replace(/-/g, "") } };
  });
  return changed ? { ...graph, nodes } : graph;
}

export interface SendMessageTarget {
  messageType: "text" | "template" | "media";
  conversationIdPath: string;
  messageTextPath: string;
  templateId: string;
  variablesPath: string;
  mediaType: "image" | "document";
  mediaUrlPath: string;
  captionPath: string;
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/**
 * Recorre el grafo desde un nodo `trigger.webhook` (por su id) buscando
 * nodos `action.send_whatsapp_message` conectados por una arista directa, y
 * devuelve cómo extraer del JSON que llegue a esa URL lo necesario para
 * enviar — según el tipo de mensaje configurado en cada nodo (texto,
 * plantilla o media).
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
    const messageType = action.data.messageType === "template" || action.data.messageType === "media" ? action.data.messageType : "text";
    targets.push({
      messageType,
      conversationIdPath: strOr(action.data.conversationIdPath, "conversation_id"),
      messageTextPath: strOr(action.data.messageTextPath, "reply.text"),
      templateId: typeof action.data.templateId === "string" ? action.data.templateId : "",
      variablesPath: strOr(action.data.variablesPath, "variables"),
      mediaType: action.data.mediaType === "document" ? "document" : "image",
      mediaUrlPath: strOr(action.data.mediaUrlPath, "media.url"),
      captionPath: strOr(action.data.captionPath, "media.caption")
    });
  }
  return targets;
}

export interface HubspotGreetingConfig {
  greetingText: string;
  senderActorId: string;
  onlyFirstMessage: boolean;
  createContactIfMissing: boolean;
  placeholderEmailDomain: string;
}

/**
 * Configuración del nodo `action.hubspot_greeting` conectado directo a un
 * `trigger.hubspot_message` — análogo a `findSendMessageTargets`, pero solo
 * espera un destino (una sola acción por disparador tiene sentido para este
 * flujo). `null` si no hay ninguno conectado o le falta el texto del saludo.
 */
export function findHubspotGreetingConfig(graph: WorkflowGraph, triggerNodeId: string): HubspotGreetingConfig | null {
  const actionId = graph.edges.find(
    (e) => e.source === triggerNodeId && graph.nodes.find((n) => n.id === e.target)?.type === "action.hubspot_greeting"
  )?.target;
  if (!actionId) return null;

  const action = graph.nodes.find((n) => n.id === actionId);
  const greetingText = typeof action?.data.hubspotGreetingText === "string" ? action.data.hubspotGreetingText.trim() : "";
  if (!action || !greetingText) return null;

  return {
    greetingText,
    senderActorId: strOr(action.data.hubspotSenderActorId, "").trim(),
    onlyFirstMessage: action.data.hubspotOnlyFirstMessage !== false,
    createContactIfMissing: action.data.hubspotCreateContactIfMissing !== false,
    placeholderEmailDomain: strOr(action.data.hubspotPlaceholderEmailDomain, "whatsapp.sin-correo.com")
  };
}

/**
 * Ids de los nodos `trigger.hubspot_message` que aplican a una bandeja
 * (inboxId) concreta — mismo criterio que `findMatchingWhatsAppTriggerNodeIds`:
 * lista vacía/ausente en el nodo = dispara para cualquier bandeja del portal.
 */
export function findMatchingHubspotTriggerNodeIds(graph: WorkflowGraph, inboxId: string): string[] {
  return graph.nodes
    .filter((n) => n.type === "trigger.hubspot_message")
    .filter((n) => {
      const inboxIds = n.data.hubspotInboxIds;
      return !Array.isArray(inboxIds) || inboxIds.length === 0 || inboxIds.includes(inboxId);
    })
    .map((n) => n.id);
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

/** Como resolveJsonPath pero para un arreglo (usado por plantillas: variables en orden). Valores no-string se convierten a texto. */
export function resolveJsonPathArray(body: unknown, path: string): string[] | undefined {
  let current: unknown = body;
  for (const part of path.split(".").filter(Boolean)) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (!Array.isArray(current)) return undefined;
  return current.map((v) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v)));
}
