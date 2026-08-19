import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toCrmLead } from "@/lib/crm-record";
import { getCrmStages } from "@/lib/crm-server";
import { getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";

const PAGE_SIZE = 25;
const LEAD_SELECT = "*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)";

function sanitizeSearch(raw: string): string {
  return raw.trim().replace(/[,()%_]/g, "").slice(0, 80);
}

/**
 * El tablero solo necesita "abiertos" o "ganados/perdidos"; "mine" y "open" comparten el
 * outcome real y se distinguen por el filtro de asesor (ver `asesor` más abajo).
 */
function resolveOutcome(outcome: string): "open" | "won" | "lost" {
  return outcome === "won" || outcome === "lost" ? outcome : "open";
}

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  const userId = user?.id ?? null;
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const db = textAgentsAdminClient();
  const sp = req.nextUrl.searchParams;
  const outcome = sp.get("outcome") ?? "open";
  const effectiveOutcome = resolveOutcome(outcome);
  const asesor = outcome === "mine" ? sp.get("asesor") : null;
  const q = sanitizeSearch(sp.get("q") ?? "");
  const stageId = sp.get("stage_id");

  let stages;
  try {
    stages = await getCrmStages(db, userId);
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        { stages: [], summary: {}, pages: {}, page_size: PAGE_SIZE, dbReady: false },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Error cargando etapas" }, { status: 500 });
  }

  let contactIds: string[] = [];
  if (q) {
    const { data: contactRows } = await db
      .from("crm_contacts")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", `%${q}%`)
      .limit(200);
    contactIds = (contactRows ?? []).map(r => String(r.id));
  }
  const orClause = q
    ? [`title.ilike.%${q}%`, ...(contactIds.length ? [`contact_id.in.(${contactIds.join(",")})`] : [])].join(",")
    : null;

  // Una sola etapa: página siguiente para "cargar más" en una columna.
  if (stageId) {
    const offset = Math.max(0, Number(sp.get("offset") ?? 0));
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? PAGE_SIZE)));

    let query = db
      .from("crm_leads")
      .select(LEAD_SELECT, { count: "exact" })
      .eq("user_id", userId)
      .eq("stage_id", stageId)
      .eq("outcome", effectiveOutcome);
    if (asesor) query = query.ilike("asesor_responsable", asesor);
    if (orClause) query = query.or(orClause);

    const { data, error, count } = await query.order("sort_order").range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const leads = (data ?? []).map(r => toCrmLead(r as Record<string, unknown>));
    return NextResponse.json({
      leads,
      total: count ?? leads.length,
      has_more: offset + leads.length < (count ?? 0)
    });
  }

  // Sin stage_id: arranque del tablero — resumen (conteo + suma) y primera página por etapa.
  let summaryQuery = db.from("crm_leads").select("stage_id, value_amount").eq("user_id", userId).eq("outcome", effectiveOutcome);
  if (asesor) summaryQuery = summaryQuery.ilike("asesor_responsable", asesor);
  if (orClause) summaryQuery = summaryQuery.or(orClause);
  const { data: summaryRows, error: summaryError } = await summaryQuery;
  if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 });

  const summary: Record<string, { count: number; sum: number }> = {};
  for (const s of stages) summary[s.id] = { count: 0, sum: 0 };
  for (const row of summaryRows ?? []) {
    const sid = String(row.stage_id);
    if (!summary[sid]) summary[sid] = { count: 0, sum: 0 };
    summary[sid].count += 1;
    summary[sid].sum += Number(row.value_amount ?? 0);
  }

  const pages: Record<string, ReturnType<typeof toCrmLead>[]> = {};
  try {
    await Promise.all(
      stages.map(async stage => {
        let pageQuery = db
          .from("crm_leads")
          .select(LEAD_SELECT)
          .eq("user_id", userId)
          .eq("stage_id", stage.id)
          .eq("outcome", effectiveOutcome);
        if (asesor) pageQuery = pageQuery.ilike("asesor_responsable", asesor);
        if (orClause) pageQuery = pageQuery.or(orClause);
        const { data, error } = await pageQuery.order("sort_order").range(0, PAGE_SIZE - 1);
        if (error) throw error;
        pages[stage.id] = (data ?? []).map(r => toCrmLead(r as Record<string, unknown>));
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error cargando leads";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    stages,
    summary,
    pages,
    page_size: PAGE_SIZE,
    current_user_name: user ? userDisplayName(user) : "Usuario",
    dbReady: true
  });
}
