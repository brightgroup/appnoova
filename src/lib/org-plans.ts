import type { adminClient } from "@/lib/voice-agents-server";

type Db = ReturnType<typeof adminClient>;

export interface OrgPlanOption {
  id: string;
  name: string;
  price_usd: number;
  monthly_credits: number;
  max_users: number | null;
  max_links: number | null;
  is_public: boolean;
}

export function formatPlanCredits(n: number): string {
  return new Intl.NumberFormat("es-CO").format(Math.round(n));
}

export function formatOrgPlanLabel(plan: OrgPlanOption): string {
  const users = plan.max_users != null ? `${plan.max_users} usuario${plan.max_users !== 1 ? "s" : ""}` : "usuarios ilimitados";
  const links = plan.max_links != null ? `${plan.max_links} link${plan.max_links !== 1 ? "s" : ""}` : "links ilimitados";
  const visibility = plan.is_public ? "" : " · solo admin";
  return `${plan.name} · $${plan.price_usd}/mes · ${formatPlanCredits(plan.monthly_credits)} cr · ${users} · ${links}${visibility}`;
}

export async function listActiveOrgPlans(db: Db): Promise<OrgPlanOption[]> {
  const { data, error } = await db
    .from("plans")
    .select("id, name, price_usd, monthly_credits, max_users, max_links, is_public, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(error.message);
  return (data ?? []) as OrgPlanOption[];
}

export async function isActivePlanId(db: Db, planId: string): Promise<boolean> {
  const { data } = await db
    .from("plans")
    .select("id")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}
