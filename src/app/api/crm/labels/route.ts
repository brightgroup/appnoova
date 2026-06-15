import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { getTenantLabels } from "@/lib/crm-labels";
import type { CrmTenantLabelKey } from "@/types/crm";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = textAgentsAdminClient();
  const labels = await getTenantLabels(db, userId);
  return NextResponse.json({ labels });
}

export async function PUT(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json();
  const labelsIn = body.labels as Record<string, string> | undefined;
  if (!labelsIn || typeof labelsIn !== "object") {
    return NextResponse.json({ error: "labels requerido" }, { status: 400 });
  }

  const allowed: CrmTenantLabelKey[] = ["producto_servicio", "categoria_interes", "asesor_asignado"];
  const db = textAgentsAdminClient();
  const now = new Date().toISOString();

  for (const key of allowed) {
    const label = String(labelsIn[key] ?? "").trim();
    if (!label) continue;
    await db.from("crm_tenant_label_config").upsert(
      {
        user_id: userId,
        campo_tecnico: key,
        label_personalizado: label,
        updated_at: now
      },
      { onConflict: "user_id,campo_tecnico" }
    );
  }

  const labels = await getTenantLabels(db, userId);
  return NextResponse.json({ labels });
}
