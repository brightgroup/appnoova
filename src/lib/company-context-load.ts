import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCompanyDisplayName } from "@/lib/company-context-resolve";

export interface LoadedCompanyContext {
  name: string;
  content: string;
}

/** Carga contexto de marca por id, priorizando alcance de organización. */
export async function loadCompanyContextById(
  db: SupabaseClient,
  companyContextId: string | null | undefined,
  scope?: { organizationId?: string | null; userId?: string | null }
): Promise<LoadedCompanyContext> {
  const id = companyContextId?.trim();
  if (!id) {
    return { name: resolveCompanyDisplayName(null), content: "" };
  }

  let query = db.from("company_contexts").select("name, content").eq("id", id);
  const orgId = scope?.organizationId?.trim();
  const userId = scope?.userId?.trim();

  if (orgId) {
    query = query.eq("organization_id", orgId);
  } else if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return {
    name: resolveCompanyDisplayName(data?.name),
    content: data?.content?.trim() ?? "",
  };
}
