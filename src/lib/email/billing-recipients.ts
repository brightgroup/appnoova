import { adminClient } from "@/lib/voice-agents-server";
import { SUPERADMIN_EMAIL } from "@/lib/rbac-constants";

/** Correos de Noova que deben enterarse de eventos de facturación (pagos, mora, suspensión). */
export async function billingAdminEmails(): Promise<string[]> {
  const fromEnv = process.env.NOOVA_ADMIN_EMAIL?.split(",").map((e) => e.trim()).filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  return [SUPERADMIN_EMAIL];
}

/** Correos del dueño + miembros activos de una organización. */
export async function orgBillingEmails(organizationId: string): Promise<string[]> {
  const db = adminClient();
  const { data: org } = await db
    .from("organizations")
    .select("owner_user_id")
    .eq("id", organizationId)
    .maybeSingle();
  const { data: members } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  const ids = [
    ...new Set(
      [org?.owner_user_id, ...(members ?? []).map((m) => m.user_id)].filter(Boolean) as string[]
    ),
  ];
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("email").in("id", ids);
  return [
    ...new Set(
      (profiles ?? [])
        .map((p) => String(p.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}

/** Separa correos de org que ya están cubiertos por la lista de admins (evita duplicados). */
export function splitClientOnlyEmails(clients: string[], admins: string[]): string[] {
  const adminSet = new Set(admins.map((e) => e.toLowerCase()));
  return clients.filter((e) => !adminSet.has(e));
}
