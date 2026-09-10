import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { paddleInvoicePdfResponse } from "@/lib/billing/paddle/invoice-pdf";

/** GET — URL temporal del PDF de Paddle (cualquier org). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  return paddleInvoicePdfResponse(id, undefined, disposition);
}
