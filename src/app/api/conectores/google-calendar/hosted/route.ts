import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { isServiceAccountConfigured } from "@/lib/google-calendar/service-account";
import { getHostedCalendarOwnerEmail } from "@/lib/google-calendar/config";
import { createHostedCalendar } from "@/lib/google-calendar/hosted";
import { upsertHostedCalendarConnection } from "@/lib/google-calendar/connections-db";

/**
 * Alternativa al OAuth por cliente: Noova crea un calendario propio (vía
 * cuenta de servicio con delegación de dominio) y lo comparte con el correo
 * del cliente. Útil mientras el conector OAuth sigue en modo Prueba de
 * Google (refresh token vence cada 7 días) — no depende de eso ni requiere
 * que el cliente conecte nada.
 */
export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  if (!isServiceAccountConfigured()) {
    return NextResponse.json(
      { error: "La cuenta de servicio con delegación de dominio no está configurada en el servidor." },
      { status: 503 }
    );
  }
  const ownerEmail = getHostedCalendarOwnerEmail();
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "Falta GOOGLE_CALENDAR_HOSTED_OWNER_EMAIL en el servidor." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sharedWithEmail = String(body.shared_with_email ?? "").trim().toLowerCase();
  if (!sharedWithEmail || !sharedWithEmail.includes("@")) {
    return NextResponse.json({ error: "Correo del cliente inválido." }, { status: 400 });
  }

  const db = adminClient();
  const { data: org } = await db
    .from("organizations")
    .select("name")
    .eq("id", orgCtx.organizationId)
    .maybeSingle();

  try {
    const { calendarId } = await createHostedCalendar({
      impersonateEmail: ownerEmail,
      summary: `Noova — ${org?.name ? String(org.name) : "Agenda"}`,
      shareWithEmail: sharedWithEmail
    });

    const connection = await upsertHostedCalendarConnection(db, {
      organizationId: orgCtx.organizationId,
      impersonateEmail: ownerEmail,
      sharedWithEmail,
      calendarId
    });

    return NextResponse.json({ connection });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error creando el calendario alojado" },
      { status: 500 }
    );
  }
}
