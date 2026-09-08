import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { createExternalQuoteSource, listExternalQuoteSources } from "@/lib/insurers/external-quote-sources-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const sources = await listExternalQuoteSources(db, orgCtx.organizationId);
  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const label = String(body?.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "Falta el nombre de la fuente (ej. Agentemotor)" }, { status: 400 });

  const db = adminClient();
  const source = await createExternalQuoteSource(db, {
    organizationId: orgCtx.organizationId,
    label,
    createdByUserId: orgCtx.userId
  });

  return NextResponse.json({ source });
}
