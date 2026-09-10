import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { paddleInvoicePdfResponse } from "@/lib/billing/paddle/invoice-pdf";

/** GET — URL temporal del PDF de Paddle para una factura de la org activa. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireOrgModule(req, "billing", "view");
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  return paddleInvoicePdfResponse(id, ctx.organizationId, disposition);
}
