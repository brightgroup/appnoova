import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_COMPANY_NAME = "Mi empresa";

export function resolveCompanyDisplayName(contextName?: string | null): string {
  const trimmed = contextName?.trim();
  return trimmed && trimmed.length >= 2 ? trimmed : FALLBACK_COMPANY_NAME;
}

export async function resolveCompanyNameForAgent(
  db: SupabaseClient,
  userId: string,
  companyContextId?: string | null
): Promise<string> {
  if (!companyContextId) return FALLBACK_COMPANY_NAME;
  const { data } = await db
    .from("company_contexts")
    .select("name")
    .eq("id", companyContextId)
    .eq("user_id", userId)
    .maybeSingle();
  return resolveCompanyDisplayName(data?.name);
}
