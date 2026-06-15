import { NextRequest, NextResponse } from "next/server";
import { getTextAgentUserIdFromRequest, textAgentsAdminClient } from "@/lib/text-agents-server";
import { enrichCrmLeadFromWhatsAppConversation } from "@/lib/crm-lead-enrich";
import { toCrmContact, toCrmLead } from "@/lib/crm-record";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const userId = await getTextAgentUserIdFromRequest(_req);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id: contactId } = await ctx.params;
  const db = textAgentsAdminClient();

  const { data: contactRow } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!contactRow) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(contactRow);
  if (!contact.inbox_conversation_id) {
    return NextResponse.json({ error: "Sin conversación vinculada" }, { status: 400 });
  }

  try {
    const result = await enrichCrmLeadFromWhatsAppConversation(
      db,
      userId,
      contactId,
      contact.inbox_conversation_id
    );

    let lead = null;
    if (result.leadId) {
      const { data } = await db
        .from("crm_leads")
        .select("*, contact:crm_contacts(*), stage:crm_pipeline_stages(*)")
        .eq("id", result.leadId)
        .eq("user_id", userId)
        .maybeSingle();
      if (data) lead = toCrmLead(data as Record<string, unknown>);
    }

    return NextResponse.json({ ...result, lead });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de IA";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
