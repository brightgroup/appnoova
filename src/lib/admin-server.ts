import { NextRequest, NextResponse } from "next/server";
import { adminClient, getUserIdFromRequest } from "@/lib/voice-agents-server";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/rbac-constants";

/** Solo superadministrador — acceso exclusivo a /admin */
export async function requireSuperAdmin(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = adminClient();

  const [{ data: profile }, { data: assignment }] = await Promise.all([
    db
      .from("profiles")
      .select("email, status, is_protected, is_platform_admin")
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("platform_role_assignments")
      .select("role_id")
      .eq("user_id", userId)
      .eq("role_id", SUPER_ADMIN_ROLE_ID)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (profile?.status === "disabled" || profile?.status === "suspended") {
    if (!profile.is_protected) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  if (profile?.is_protected || assignment) {
    return { userId };
  }

  return NextResponse.json({ error: "No autorizado — solo superadministrador" }, { status: 403 });
}

/** @deprecated Usar requireSuperAdmin */
export const requireAdmin = requireSuperAdmin;

export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("is_protected")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_protected) return true;

  const { data: assignment } = await db
    .from("platform_role_assignments")
    .select("role_id")
    .eq("user_id", userId)
    .eq("role_id", SUPER_ADMIN_ROLE_ID)
    .eq("status", "active")
    .maybeSingle();

  return !!assignment;
}

export async function isProtectedUser(userId: string): Promise<boolean> {
  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("is_protected, email")
    .eq("id", userId)
    .maybeSingle();

  return profile?.is_protected === true;
}
