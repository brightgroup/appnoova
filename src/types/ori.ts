/** Shape de lo que devuelven las tools de Ori — compartido entre backend y las dos UIs (escritorio/mobile) para renderizar tabla real en vez de confiar en la prosa del modelo. */

export interface OriToolCall {
  name: string;
  result: Record<string, unknown>;
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
