import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { listQuoteRequests, type QuoteRequestEstado } from "@/lib/insurers/quote-requests-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const estado = req.nextUrl.searchParams.get("estado") as QuoteRequestEstado | null;
  const db = adminClient();
  const requests = await listQuoteRequests(db, orgCtx.organizationId, estado ? { estado } : undefined);

  return NextResponse.json({ requests });
}
