import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOrgBusinessHours, type OrgBusinessHours } from "@/lib/scheduling/rules";

export async function getOrgBusinessHours(
  db: SupabaseClient,
  organizationId: string
): Promise<OrgBusinessHours> {
  const { data } = await db
    .from("organizations")
    .select("business_hours")
    .eq("id", organizationId)
    .maybeSingle();

  return normalizeOrgBusinessHours(data?.business_hours);
}

export async function saveOrgBusinessHours(
  db: SupabaseClient,
  organizationId: string,
  hours: OrgBusinessHours
): Promise<void> {
  const { error } = await db
    .from("organizations")
    .update({ business_hours: hours, updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  if (error) {
    throw new Error(error.message);
  }
}
