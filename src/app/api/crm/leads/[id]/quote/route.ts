import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { generateOriQuote, type CrmQuoteRecord } from "@/lib/crm-ai-extract";
import { recordOriUsageForUser } from "@/lib/billing/meter";
import { getTenantLabels } from "@/lib/crm-labels";
import { getDefaultCompanyContextContent } from "@/lib/company-context";
import { toCrmContact, toCrmLead } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(_req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const [{ data: row }, labels, companyContext] = await Promise.all([
    db
      .from("crm_leads")
      .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle(),
    getTenantLabels(db, userId),
    getDefaultCompanyContextContent(db, userId)
  ]);

  if (!row) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  const lead = toCrmLead(row as Record<string, unknown>);
  const contactRaw = row.contact as Record<string, unknown> | null;
  if (!contactRaw) {
    return NextResponse.json({ error: "El lead requiere un contacto vinculado" }, { status: 400 });
  }

  const contact = toCrmContact(contactRaw);

  try {
    const { result: quote, usage, model } = await generateOriQuote(contact, {
      labels: { categoria: labels.categoria_interes, producto: labels.producto_servicio },
      lead: {
        title: lead.title,
        categoria_interes: lead.categoria_interes,
        producto_interes: lead.producto_interes,
        value_amount: lead.value_amount,
        currency: lead.currency,
        stage_name: lead.stage?.name ?? null
      },
      companyContext
    });
    await recordOriUsageForUser({
      db,
      userId,
      eventType: "quote",
      usage,
      model,
      channel: "crm_quote",
      referenceType: "crm_lead",
      referenceId: id,
      idempotencyKey: `quote_${quote.id}`
    });

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const prev = (meta.crm_quotes as CrmQuoteRecord[]) ?? [];
    const crm_quotes = [quote, ...prev].slice(0, 10);

    await db
      .from("crm_leads")
      .update({
        metadata: { ...meta, crm_quotes, last_quote_id: quote.id },
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", userId);

    return NextResponse.json({ quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al generar cotización";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
