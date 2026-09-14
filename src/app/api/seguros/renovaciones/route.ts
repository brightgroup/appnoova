import { NextRequest, NextResponse } from "next/server";
import { requireSegurosCrmAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";
import { listPolizas } from "@/lib/insurers/polizas-db";
import { listAvisosPorPoliza } from "@/lib/insurers/renovacion-avisos-db";

/** GET — pólizas activas venciendo dentro de la ventana pedida (?dias=, default 60), con sus avisos ya enviados. */
export async function GET(req: NextRequest) {
  const ctx = await requireSegurosCrmAccess(req, "view");
  if (ctx instanceof NextResponse) return ctx;

  const dias = Number(req.nextUrl.searchParams.get("dias") ?? "60");
  const hastaISO = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

  const db = adminClient();
  const polizas = await listPolizas(db, ctx.crmUserId, { estado: "activa", venceAntesDe: hastaISO });

  const contactIds = [...new Set(polizas.map(p => p.contactId))];
  const { data: contactRows } = contactIds.length
    ? await db.from("crm_contacts").select("id, name, telefono, whatsapp").in("id", contactIds)
    : { data: [] as { id: string; name: string; telefono: string | null; whatsapp: string | null }[] };
  const contactById = new Map((contactRows ?? []).map(c => [c.id, c]));

  const proximas = await Promise.all(
    polizas.map(async poliza => ({
      poliza,
      contacto: contactById.get(poliza.contactId) ?? null,
      avisos: await listAvisosPorPoliza(db, poliza.id)
    }))
  );

  return NextResponse.json({ proximas });
}
