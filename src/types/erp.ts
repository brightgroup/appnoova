export interface InventoryItem {
  id: string;
  organizationId: string;
  codigo: string;
  nombre: string;
  marca: string | null;
  responsable: string | null;
  stockMinimo: number | null;
  existencia: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InventoryMovementType = "entrada" | "salida" | "ajuste" | "saldo_inicial";

export interface InventoryMovement {
  id: string;
  organizationId: string;
  itemId: string;
  tipo: InventoryMovementType;
  delta: number;
  existenciaResultante: number;
  fecha: string;
  responsable: string | null;
  nota: string | null;
  createdByUserId: string | null;
  createdByLabel?: string | null;
  createdAt: string;
}

export type InventoryAlertMode = "al_cruzar" | "resumen_diario" | "ambos";

export interface InventoryAlertRule {
  organizationId: string;
  enabled: boolean;
  canalEmail: boolean;
  destinatarios: string[];
  modo: InventoryAlertMode;
  horaResumen: number;
  updatedAt: string;
}

export function isLowStock(item: Pick<InventoryItem, "existencia" | "stockMinimo">): boolean {
  return item.stockMinimo !== null && item.existencia <= item.stockMinimo;
}

/**
 * "Fecha" (`fecha`, solo día — puede quedar retroactiva si alguien la edita al
 * registrar) + la hora real en que se registró (`createdAt`, con precisión de
 * segundos) — para que el kardex quede completo sin perder la fecha elegida.
 */
export function formatMovementDateTime(m: Pick<InventoryMovement, "fecha" | "createdAt">): string {
  const time = new Date(m.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  return `${m.fecha} · ${time}`;
}
