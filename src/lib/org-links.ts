import type { adminClient } from "@/lib/voice-agents-server";

type Db = ReturnType<typeof adminClient>;

export interface OrgLinkSnapshot {
  used: number;
  max: number | null;
  remaining: number | null;
  planId: string | null;
}

export async function getOrgLinkSnapshot(db: Db, organizationId: string): Promise<OrgLinkSnapshot> {
  const { data: subRow } = await db
    .from("organization_subscriptions")
    .select("plan_id, plans(max_links)")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const planRaw = subRow?.plans as { max_links: number | null } | { max_links: number | null }[] | null;
  const maxLinks = Array.isArray(planRaw) ? planRaw[0]?.max_links ?? null : planRaw?.max_links ?? null;

  const { count } = await db
    .from("broker_microsites")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const used = count ?? 0;

  return {
    used,
    max: maxLinks,
    remaining: maxLinks != null ? Math.max(0, maxLinks - used) : null,
    planId: subRow?.plan_id ?? null,
  };
}

export async function assertOrgHasAvailableLink(
  db: Db,
  organizationId: string
): Promise<{ ok: true; links: OrgLinkSnapshot } | { ok: false; links: OrgLinkSnapshot; message: string }> {
  const links = await getOrgLinkSnapshot(db, organizationId);
  if (links.max != null && links.used >= links.max) {
    return {
      ok: false,
      links,
      message: `Su plan permite máximo ${links.max} Mi Link${links.max === 1 ? "" : "s"}. Actualice el plan para agregar más.`,
    };
  }
  return { ok: true, links };
}
