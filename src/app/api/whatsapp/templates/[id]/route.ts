import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";
import { toWhatsAppTemplateRecord } from "@/lib/whatsapp/template-record";
import { syncTemplateApproval, updateWhatsAppTemplate } from "@/lib/whatsapp/template-server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const userId = await getTextAgentUserIdFromRequest(_req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const { data, error } = await db
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const template = await syncTemplateApproval(db, toWhatsAppTemplateRecord(data));
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const db = textAgentsAdminClient();
  const result = await updateWhatsAppTemplate({ db, userId, templateId: id, body });

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ template: result.template });
}
