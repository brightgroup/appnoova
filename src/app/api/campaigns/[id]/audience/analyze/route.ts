import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/voice-agents-server";
import { requireOrgModule } from "@/lib/module-auth";
import { parseExcelBuffer } from "@/lib/data-tables/parse-excel";
import { analyzeAudienceAgainstCrm } from "@/lib/campaigns/import-contacts";
import type { CampaignFieldMapping } from "@/types/voice-campaign";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST — analiza el Excel contra el CRM SIN persistir nada.
 * Devuelve el resumen previo: existentes, nuevos, inválidos, duplicados y "no contactar".
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireOrgModule(req, "campaigns", "edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const db = adminClient();

  const { data: campaign, error: campErr } = await db
    .from("voice_campaigns")
    .select("id, user_id")
    .eq("id", id)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  let mapping: CampaignFieldMapping;
  try {
    mapping = JSON.parse(String(form.get("field_mapping") ?? "")) as CampaignFieldMapping;
  } catch {
    return NextResponse.json({ error: "field_mapping inválido" }, { status: 400 });
  }
  if (!mapping?.phone_column) {
    return NextResponse.json({ error: "Indica la columna del teléfono" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseExcelBuffer(await file.arrayBuffer(), file.name);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo leer el Excel" },
      { status: 400 }
    );
  }

  try {
    const { summary } = await analyzeAudienceAgainstCrm(
      db,
      String(campaign.user_id),
      parsed.rows,
      mapping,
      parsed.columns
    );
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al analizar" },
      { status: 500 }
    );
  }
}
