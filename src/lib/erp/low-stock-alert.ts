import { adminClient } from "@/lib/voice-agents-server";
import { getInventoryAlertRule } from "@/lib/erp/alert-rules-db";
import { notifyLowStock } from "@/lib/email/notify-low-stock";

/** Compartido entre el registro de movimientos individual y por lote (pedido). */
export async function maybeSendLowStockAlert(
  db: ReturnType<typeof adminClient>,
  organizationId: string,
  item: { id: string; codigo: string; nombre: string; existencia: number; stockMinimo: number }
): Promise<void> {
  const rule = await getInventoryAlertRule(db, organizationId);
  if (!rule.enabled || !rule.canalEmail) return;
  if (rule.modo !== "al_cruzar" && rule.modo !== "ambos") return;
  await notifyLowStock({ organizationId, items: [item] });
}
