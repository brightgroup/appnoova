import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { generateOriQuote, type CrmQuoteRecord } from "@/lib/crm-ai-extract";
import { getDefaultCompanyContextContent } from "@/lib/company-context";
import { getTenantLabels } from "@/lib/crm-labels";
import { toCrmContact } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(_req, "view");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();
  const { data } = await db.from("crm_contacts").select("metadata").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const meta = (data.metadata as Record<string, unknown>) ?? {};
  const quotes = (meta.crm_quotes as CrmQuoteRecord[]) ?? [];
  return NextResponse.json({ quotes });
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const userId = await getCrmUserId(_req, "edit");
  if (userId instanceof NextResponse) return userId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const [{ data: row }, labels, companyContext] = await Promise.all([
    db.from("crm_contacts").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
    getTenantLabels(db, userId),
    getDefaultCompanyContextContent(db, userId)
  ]);

  if (!row) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(row);

  try {
    const quote = await generateOriQuote(contact, {
      labels: {
        categoria: labels.categoria_interes,
        producto: labels.producto_servicio
      },
      companyContext
    });

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const prev = (meta.crm_quotes as CrmQuoteRecord[]) ?? [];
    const crm_quotes = [quote, ...prev].slice(0, 10);

    await db
      .from("crm_contacts")
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
