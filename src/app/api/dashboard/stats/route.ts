import { NextRequest, NextResponse } from "next/server";
import { getOrgContextFromRequest } from "@/lib/org-server";
import { adminClient, getAuthUserFromRequest, userDisplayName } from "@/lib/voice-agents-server";

function pctChange(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current <= 0) return null;
    return "+100%";
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function startOfUtcDay(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

async function getOrgUserIds(db: ReturnType<typeof adminClient>, orgId: string): Promise<string[]> {
  const [{ data: org }, { data: members }] = await Promise.all([
    db.from("organizations").select("owner_user_id").eq("id", orgId).maybeSingle(),
    db
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("status", "active"),
  ]);

  const ids = new Set<string>();
  if (org?.owner_user_id) ids.add(org.owner_user_id);
  (members ?? []).forEach((m) => ids.add(m.user_id));
  return [...ids];
}

/** GET — métricas del panel principal del cliente */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContextFromRequest(req);
  if (ctx instanceof NextResponse) return ctx;

  const user = await getAuthUserFromRequest(req);
  const db = adminClient();
  const orgId = ctx.organizationId;
  const orgUserIds = await getOrgUserIds(db, orgId);

  const now = new Date();
  const day30Ago = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
  const day60Ago = new Date(now.getTime() - 60 * 24 * 3600_000).toISOString();
  const day24Ago = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const todayStart = startOfUtcDay(now);

  const crmFilter = orgUserIds.length > 0 ? orgUserIds : [ctx.userId];

  const [
    openLeadsRes,
    newOpenLeads30Res,
    newOpenLeadsPrev30Res,
    conv30Res,
    convPrev30Res,
    quotesTodayRes,
    quotesYesterdayRes,
    wonRes,
    lostRes,
    won30Res,
    wonPrev30Res,
    recentLeadsRes,
    usage24Res,
    convCalls24Res,
  ] = await Promise.all([
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "open"),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "open")
      .gte("created_at", day30Ago),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "open")
      .gte("created_at", day60Ago)
      .lt("created_at", day30Ago),
    db
      .from("text_agent_conversations")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .gte("created_at", day30Ago),
    db
      .from("text_agent_conversations")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .gte("created_at", day60Ago)
      .lt("created_at", day30Ago),
    db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("event_type", "quote")
      .gte("created_at", todayStart),
    db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("event_type", "quote")
      .gte("created_at", new Date(now.getTime() - 48 * 3600_000).toISOString())
      .lt("created_at", todayStart),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "won"),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "lost"),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "won")
      .gte("updated_at", day30Ago),
    db
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .eq("outcome", "won")
      .gte("updated_at", day60Ago)
      .lt("updated_at", day30Ago),
    db
      .from("crm_leads")
      .select("id, title, updated_at, stage:crm_pipeline_stages(name), contact:crm_contacts(name)")
      .in("user_id", crmFilter)
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("usage_events")
      .select("event_type")
      .eq("organization_id", orgId)
      .gte("created_at", day24Ago),
    db
      .from("voice_agent_calls")
      .select("id", { count: "exact", head: true })
      .in("user_id", crmFilter)
      .gte("created_at", day24Ago),
  ]);

  const openLeads = openLeadsRes.count ?? 0;
  const newOpenLeads30 = newOpenLeads30Res.count ?? 0;
  const newOpenLeadsPrev30 = newOpenLeadsPrev30Res.count ?? 0;
  const conversations30 = conv30Res.count ?? 0;
  const conversationsPrev30 = convPrev30Res.count ?? 0;
  const quotesToday = quotesTodayRes.count ?? 0;
  const quotesYesterday = quotesYesterdayRes.count ?? 0;
  const won = wonRes.count ?? 0;
  const lost = lostRes.count ?? 0;
  const won30 = won30Res.count ?? 0;
  const wonPrev30 = wonPrev30Res.count ?? 0;
  const closed = won + lost;
  const conversionRate = closed > 0 ? Math.round((won / closed) * 1000) / 10 : 0;

  const usage24 = usage24Res.data ?? [];
  const convProcessed = usage24.filter((e) =>
    ["ori", "milink", "widget", "text_test", "whatsapp_ai", "whatsapp_manual"].includes(e.event_type)
  ).length;
  const quotesGenerated24 = usage24.filter((e) => e.event_type === "quote").length;
  const leadsClassified24 = usage24.filter((e) =>
    ["form_fill", "doc_scan"].includes(e.event_type)
  ).length;
  const voiceCalls24 = convCalls24Res.count ?? 0;

  function relOne<T>(value: T | T[] | null | undefined): T | null {
    if (value == null) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
  }

  function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diffMs / 3600_000);
    if (h < 1) return "Hace un momento";
    if (h < 24) return `Hace ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "Hace 1 día" : `Hace ${d} días`;
  }

  const recentLeads = (recentLeadsRes.data ?? []).map((row) => {
    const stage = relOne(row.stage as { name: string } | { name: string }[] | null);
    const contact = relOne(row.contact as { name: string } | { name: string }[] | null);
    return {
      id: row.id as string,
      name: contact?.name ?? (row.title as string),
      subtitle: stage?.name ?? "Lead",
      status: stage?.name ?? "Activo",
      dateLabel: timeAgo(String(row.updated_at)),
    };
  });

  const displayName = user ? userDisplayName(user) : "Usuario";
  const email = user?.email ?? "";

  return NextResponse.json({
    profile: {
      name: displayName,
      email,
      initials: displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "?",
    },
    organization: { id: orgId, name: ctx.organizationName },
    stats: {
      active_leads: {
        value: openLeads,
        change: pctChange(newOpenLeads30, newOpenLeadsPrev30),
      },
      conversations: {
        value: conversations30,
        change: pctChange(conversations30, conversationsPrev30),
      },
      quotes_today: {
        value: quotesToday,
        change: pctChange(quotesToday, quotesYesterday),
      },
      conversion_rate: {
        value: conversionRate,
        change: pctChange(won30, wonPrev30),
      },
    },
    recent_leads: recentLeads,
    activity_24h: {
      conversations_processed: convProcessed,
      quotes_generated: quotesGenerated24,
      leads_classified: leadsClassified24,
      voice_calls_completed: voiceCalls24,
    },
  });
}
