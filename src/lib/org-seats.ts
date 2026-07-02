import type { adminClient } from "@/lib/voice-agents-server";

type Db = ReturnType<typeof adminClient>;

export interface OrgSeatSnapshot {
  used: number;
  max: number | null;
  remaining: number | null;
  planId: string | null;
}

export async function getOrgSeatSnapshot(db: Db, organizationId: string): Promise<OrgSeatSnapshot> {
  const { data: subRow } = await db
    .from("organization_subscriptions")
    .select("plan_id, plans(max_users)")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const planRaw = subRow?.plans as { max_users: number | null } | { max_users: number | null }[] | null;
  const maxUsers = Array.isArray(planRaw) ? planRaw[0]?.max_users ?? null : planRaw?.max_users ?? null;

  const [{ count: memberCount }, { count: inviteCount }] = await Promise.all([
    db
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["active", "invited"]),
    db
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const used = (memberCount ?? 0) + (inviteCount ?? 0);

  return {
    used,
    max: maxUsers,
    remaining: maxUsers != null ? Math.max(0, maxUsers - used) : null,
    planId: subRow?.plan_id ?? null,
  };
}

export async function assertOrgHasAvailableSeat(
  db: Db,
  organizationId: string
): Promise<{ ok: true; seats: OrgSeatSnapshot } | { ok: false; seats: OrgSeatSnapshot; message: string }> {
  const seats = await getOrgSeatSnapshot(db, organizationId);
  if (seats.max != null && seats.used >= seats.max) {
    return {
      ok: false,
      seats,
      message: `Su plan permite máximo ${seats.max} usuarios. Actualice el plan para agregar más.`,
    };
  }
  return { ok: true, seats };
}
