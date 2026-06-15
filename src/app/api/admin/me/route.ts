import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";

/** GET — estado del superadmin en sesión */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    is_super_admin: true,
    user_id: auth.userId,
  });
}
