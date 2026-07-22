import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { requireCrmAccess } from "@/lib/crm-auth";
import { resolveOrgCrmTenantUserId } from "@/lib/org-crm-tenant";
import {
  buildContactTimeline,
  mergeTimelineDaySummaries,
  readTimelineDaySummaries,
  timelineDaySummariesChanged,
  type ContactAppointmentRow
} from "@/lib/crm-contact-timeline";
import { toCrmContact, toCrmLead } from "@/lib/crm-record";
import type { TextChatMessage } from "@/types/text-agent-conversation";

type Ctx = { params: Promise<{ id: string }> };

function normalizeMessages(raw: unknown): TextChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(m => m && typeof m === "object") as TextChatMessage[];
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const orgCtx = await requireCrmAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const userId = await resolveOrgCrmTenantUserId(orgCtx.organizationId, orgCtx.userId);
  const organizationId = orgCtx.organizationId;

  const { id } = await ctx.params;
  const db = textAgentsAdminClient();

  const contactRes = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!contactRes.data) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  const contact = toCrmContact(contactRes.data);
  const phones = [contact.whatsapp, contact.telefono, contact.phone].filter(Boolean) as string[];

  const appointmentFilters: string[] = phones.map(p => `contact_phone.eq.${p}`);
  if (contact.email) appointmentFilters.push(`contact_email.eq.${contact.email}`);
  if (contact.inbox_conversation_id) appointmentFilters.push(`conversation_id.eq.${contact.inbox_conversation_id}`);

  const [leadsRes, convRes, callsRes, appointmentsRes] = await Promise.all([
    db
      .from("crm_leads")
      .select("*")
      .eq("user_id", userId)
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
    contact.inbox_conversation_id
      ? db
          .from("text_agent_conversations")
          .select("messages, metadata")
          .eq("id", contact.inbox_conversation_id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    phones.length
      ? db
          .from("voice_agent_calls")
          .select("id, created_at, duration_sec, summary, status_label, phone_number")
          .eq("user_id", userId)
          .in("phone_number", phones)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    organizationId && appointmentFilters.length
      ? db
          .from("appointments")
          .select("id, created_at, starts_at, reason, status, source_channel")
          .eq("organization_id", organizationId)
          .or(appointmentFilters.join(","))
          .order("starts_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null })
  ]);

  const leads = (leadsRes.data ?? []).map(r => toCrmLead(r as Record<string, unknown>));
  const messages = normalizeMessages(convRes.data?.messages);
  const conversationMetadata =
    convRes.data?.metadata && typeof convRes.data.metadata === "object" && !Array.isArray(convRes.data.metadata)
      ? (convRes.data.metadata as Record<string, unknown>)
      : {};
  const daySummaries = readTimelineDaySummaries(conversationMetadata);
  const calls = (callsRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    duration_sec: number;
    summary: string;
    status_label: string;
  }>;
  const appointments = (appointmentsRes.data ?? []) as ContactAppointmentRow[];

  const { events, daySummaries: nextDaySummaries } = await buildContactTimeline({
    contact,
    leads,
    messages,
    daySummaries,
    calls,
    appointments
  });

  if (
    contact.inbox_conversation_id &&
    timelineDaySummariesChanged(daySummaries, nextDaySummaries)
  ) {
    await db
      .from("text_agent_conversations")
      .update({
        metadata: mergeTimelineDaySummaries(conversationMetadata, nextDaySummaries)
      })
      .eq("id", contact.inbox_conversation_id)
      .eq("user_id", userId);
  }

  return NextResponse.json({ events });
}
