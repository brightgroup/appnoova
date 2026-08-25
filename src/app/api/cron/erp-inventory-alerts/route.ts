import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { listInventoryItems } from "@/lib/erp/inventory-db";
import { notifyLowStock } from "@/lib/email/notify-low-stock";

/**
 * Resumen diario de stock mínimo por organización (modo "resumen_diario" o
 * "ambos" en erp_inventory_alert_rules). Pensado para correr por hora (no una
 * vez al día): cada organización elige su propia hora_resumen (0-23, hora de
 * Bogotá) y este job solo envía a las que coinciden con la hora actual —
 * "configurable, no cableado" también para el horario del resumen.
 *
 * Auth: header `x-cron-secret` == CRON_SECRET, o superadmin autenticado.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");

  if (secret) {
    if (provided !== secret) {
      const auth = await requireSuperAdmin(req);
      if (auth instanceof NextResponse) return auth;
    }
  } else {
    const auth = await requireSuperAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  const db = adminClient();

  const currentHour = Number(
    new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false })
  );

  const { data: rules, error } = await db
    .from("erp_inventory_alert_rules")
    .select("organization_id, hora_resumen")
    .eq("enabled", true)
    .eq("canal_email", true)
    .in("modo", ["resumen_diario", "ambos"])
    .eq("hora_resumen", currentHour);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { organization_id: string; sent: boolean; low_stock_count: number }[] = [];

  for (const rule of rules ?? []) {
    const organizationId = rule.organization_id as string;
    const gate = await assertOrgErpEnabled(db, organizationId);
    if (!gate.ok) continue;

    const items = await listInventoryItems(db, organizationId, {});
    const lowStock = items.filter(i => i.stockMinimo !== null && i.existencia <= i.stockMinimo);
    if (!lowStock.length) {
      results.push({ organization_id: organizationId, sent: false, low_stock_count: 0 });
      continue;
    }

    const result = await notifyLowStock({
      organizationId,
      items: lowStock.map(i => ({
        id: i.id,
        codigo: i.codigo,
        nombre: i.nombre,
        existencia: i.existencia,
        stockMinimo: i.stockMinimo ?? 0
      }))
    });
    results.push({ organization_id: organizationId, sent: result.sent, low_stock_count: lowStock.length });
  }

  return NextResponse.json({ ok: true, hour_checked: currentHour, organizations_checked: rules?.length ?? 0, results });
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
