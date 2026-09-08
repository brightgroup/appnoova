import type { SupabaseClient } from "@supabase/supabase-js";

/** Solo se aplica cuando la organización usa la cuenta compartida de Noova (ver auto-quote-tool.ts). */
export const VEHICLE_LOOKUP_MAX_PER_WINDOW = 3;
const WINDOW_HOURS = 24;

export async function countRecentVehicleLookups(
  db: SupabaseClient,
  organizationId: string,
  contactKey: string
): Promise<number> {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("vehicle_lookup_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("contact_key", contactKey)
    .gte("created_at", since);
  return count ?? 0;
}

export async function logVehicleLookup(
  db: SupabaseClient,
  organizationId: string,
  contactKey: string,
  plate: string
): Promise<void> {
  await db.from("vehicle_lookup_log").insert({ organization_id: organizationId, contact_key: contactKey, plate });
}
