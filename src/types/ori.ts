/** Shape de lo que devuelven las tools de Ori — compartido entre backend y las dos UIs (escritorio/mobile) para renderizar tabla real en vez de confiar en la prosa del modelo. */

export interface OriToolCall {
  name: string;
  result: Record<string, unknown>;
}

/** Fila del historial de chats de Ori (panel "Chats") — ver ori_conversations. */
export interface OriConversationSummary {
  id: string;
  title: string;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OriConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: OriToolCall[];
  createdAt: string;
}

export interface OriConversationDetail extends OriConversationSummary {
  companyContextId: string | null;
  model: string | null;
  messages: OriConversationMessage[];
}

export interface OriInventoryProductRow {
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  existencia: number;
  stock_minimo: number | null;
  bajo_minimo: boolean;
}

export interface OriInventoryMovementRow {
  producto: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  saldo_resultante: number;
  responsable: string | null;
  registrado_por: string | null;
  nota: string | null;
}

export function toolProductRows(call: OriToolCall): OriInventoryProductRow[] {
  if (call.name !== "consultar_inventario") return [];
  const rows = call.result.productos;
  return Array.isArray(rows) ? (rows as OriInventoryProductRow[]) : [];
}

export function toolMovementRows(call: OriToolCall): OriInventoryMovementRow[] {
  if (call.name !== "consultar_movimientos_inventario") return [];
  const rows = call.result.movimientos;
  return Array.isArray(rows) ? (rows as OriInventoryMovementRow[]) : [];
}

/** Texto "mostrando X de Y" cuando la tool truncó el resultado — mismo criterio en las dos tablas. */
export function toolTruncationCaption(call: OriToolCall): string | null {
  const total = call.result.total_encontrados;
  const mostrados = call.result.mostrados;
  if (typeof total !== "number" || typeof mostrados !== "number") return null;
  if (mostrados >= total) return null;
  return `Mostrando ${mostrados} de ${total} — para el listado completo, revisa la tabla en ERP.`;
}

export type InsuranceQuoteRamo = "autos" | "vida" | "hogar" | "motos" | "soat" | "accidentes_personales";

/**
 * Solo autos sigue con tarjeta propia (AutoQuoteCard) en ORI/Mi Link/widget web
 * — vida, hogar y salud pasaron a la tool genérica cotizar_seguro
 * (ver src/lib/insurers/generic-quote-tool.ts), cuyo
 * `faltan_datos` ya no es un array de strings sino de objetos {key,label,tipo,
 * opciones} — generalizar AutoQuoteCard a ese shape es trabajo aparte (otra
 * superficie, no WhatsApp) que quedó fuera de esta ronda a propósito.
 */
const INSURANCE_QUOTE_TOOL_RAMOS: Record<string, InsuranceQuoteRamo> = {
  cotizar_seguro_auto: "autos",
  cotizar_seguro_vida: "vida",
  cotizar_seguro_hogar: "hogar",
  cotizar_seguro_moto: "motos",
  cotizar_seguro_soat: "soat",
  cotizar_seguro_accidentes: "accidentes_personales"
};

/** Resultado de la tool de cotización de autos (ver src/lib/insurers/auto-quote-tool.ts) — único ramo con tarjeta dedicada hoy. */
export function toolInsuranceQuote(
  call: { name: string; result: Record<string, unknown> }
): { ramo: InsuranceQuoteRamo; result: Record<string, unknown> } | null {
  const ramo = INSURANCE_QUOTE_TOOL_RAMOS[call.name];
  if (!ramo) return null;
  return { ramo, result: call.result };
}

export interface QuoteResultPreview {
  quote_request_id: string;
  ramo: string;
  aseguradora: string;
  nombre_plan?: string;
  descripcion?: string;
  periodicidad: "mensual" | "anual" | "mensual_y_anual" | "pago_unico";
  precio_mensual?: number | null;
  precio_anual?: number | null;
  incluye?: string[];
  beneficios?: string[];
}

/** Previsualización armada por estructurar_resultado_cotizacion (ver src/lib/agent-tools/quote-result-ori-tool.ts) — nunca se guarda sola, el asesor la confirma en la ficha. */
export function toolQuoteResultPreview(call: OriToolCall): QuoteResultPreview | null {
  if (call.name !== "estructurar_resultado_cotizacion") return null;
  if (call.result.ok !== true) return null;
  const preview = call.result.preview;
  return preview && typeof preview === "object" ? (preview as QuoteResultPreview) : null;
}
