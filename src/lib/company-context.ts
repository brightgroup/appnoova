import type { SupabaseClient } from "@supabase/supabase-js";

export async function getDefaultCompanyContextContent(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await db
    .from("company_contexts")
    .select("content")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  return String(data?.content ?? "").trim();
}
