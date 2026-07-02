import { adminClient } from "@/lib/voice-agents-server";

/** CRM legacy: registros por user_id del propietario de la organización. */
export async function resolveOrgCrmTenantUserId(
  organizationId: string,
  fallbackUserId: string
): Promise<string> {
  const db = adminClient();
  const { data } = await db
    .from("organizations")
    .select("owner_user_id")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.owner_user_id ?? fallbackUserId;
}
