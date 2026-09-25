import { NextRequest, NextResponse } from "next/server";
import { getOrgServiceBlock } from "@/lib/billing/org-service-gate";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import { assertOrgErpEnabled } from "@/lib/org-modules";
import { listInventoryItems } from "@/lib/erp/inventory-db";
import { notifyLowStock } from "@/lib/email/notify-low-stock";

/** Hora 0–23 en America/Bogota. No usar toLocaleString(hour) — en Node a veces trae la fecha completa y Number() da NaN. */
function bogotaHourNow(): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

/** Fecha YYYY-MM-DD en America/Bogota, para llevar el control de "ya se procesó hoy". */
function bogotaDateNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Resumen diario de stock mínimo por organización (modo "resumen_diario" o
 * "ambos" en erp_inventory_alert_rules). Pensado para correr por hora (no una
 * vez al día): cada organización elige su propia hora_resumen (0-23, hora de
 * Bogotá).
 *
 * Ojo: el workflow de GitHub Actions declara `0 * * * *` pero GitHub NO
 * garantiza esa cadencia — bajo carga puede atrasar o SALTAR por completo la
 * ejecución de una hora (visto en producción: pasó de hour_checked=17 a
 * hour_checked=19 sin ningún run en medio). Por eso NO comparamos
 * `hora_resumen === currentHour` a secas — eso perdería el resumen del día
 * entero si esa hora se salta. En vez de eso disparamos para toda
 * organización con `hora_resumen <= currentHour` que aún no se haya marcado
 * como procesada HOY (`ultimo_resumen_enviado_en`), así el siguiente run —
 * llegue tarde o no — la "alcanza". Sigue sin reenviar dos veces el mismo día
 * ni disparar antes de la hora configurada.
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
  const currentHour = bogotaHourNow();
  const today = bogotaDateNow();
  if (!Number.isInteger(currentHour) || currentHour < 0 || currentHour > 23) {
    return NextResponse.json({ error: "hora Bogotá inválida", currentHour }, { status: 500 });
  }

  const { data: rules, error } = await db
    .from("erp_inventory_alert_rules")
    .select("organization_id, hora_resumen, ultimo_resumen_enviado_en")
    .eq("enabled", true)
    .eq("canal_email", true)
    .in("modo", ["resumen_diario", "ambos"])
    .lte("hora_resumen", currentHour)
    .or(`ultimo_resumen_enviado_en.is.null,ultimo_resumen_enviado_en.lt.${today}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: {
    organization_id: string;
    sent: boolean;
    low_stock_count: number;
    reason?: string;
  }[] = [];

  for (const rule of rules ?? []) {
    const organizationId = rule.organization_id as string;

    // Se marca como procesada HOY así el gate o el chequeo de stock fallen,
    // para no quedar reintentando en loop cada hora el resto del día por una
    // organización con el módulo apagado o sin productos en mínimo.
    const markProcessedToday = () =>
      db
        .from("erp_inventory_alert_rules")
        .update({ ultimo_resumen_enviado_en: today })
        .eq("organization_id", organizationId);

    const gate = await assertOrgErpEnabled(db, organizationId);
    if (!gate.ok || (await getOrgServiceBlock(db, organizationId))) {
      await markProcessedToday();
      continue;
    }

    const items = await listInventoryItems(db, organizationId, {});
    const lowStock = items.filter((i) => i.stockMinimo !== null && i.existencia <= i.stockMinimo);
    if (!lowStock.length) {
      results.push({ organization_id: organizationId, sent: false, low_stock_count: 0, reason: "no_low_stock" });
      await markProcessedToday();
      continue;
    }

    const result = await notifyLowStock({
      organizationId,
      items: lowStock.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        nombre: i.nombre,
        marca: i.marca,
        existencia: i.existencia,
        stockMinimo: i.stockMinimo ?? 0,
      })),
    });
    results.push({
      organization_id: organizationId,
      sent: result.sent,
      low_stock_count: lowStock.length,
      reason: result.sent === false ? result.reason : undefined,
    });
    await markProcessedToday();
  }

  return NextResponse.json({
    ok: true,
    hour_checked: currentHour,
    organizations_checked: rules?.length ?? 0,
    results,
  });
}

export async function POST(req: NextRequest) {
  return run(req);
}

export async function GET(req: NextRequest) {
  return run(req);
}
