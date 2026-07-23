import { mintDelegatedAccessToken } from "@/lib/google-calendar/service-account";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const HOSTED_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export interface CreateHostedCalendarInput {
  /** Cuenta de Workspace de Noova que suplanta la cuenta de servicio (dueña del calendario ante Google). */
  impersonateEmail: string;
  /** Nombre visible del calendario (ej. "Noova — Resguarda Seguros"). */
  summary: string;
  /** Correo del cliente al que se comparte, para que le aparezca como calendario propio. */
  shareWithEmail: string;
}

/**
 * Crea un calendario secundario bajo `impersonateEmail` (vía delegación de
 * dominio, sin OAuth por cliente) y lo comparte con permiso de edición al
 * correo del cliente.
 */
export async function createHostedCalendar(input: CreateHostedCalendarInput): Promise<{ calendarId: string }> {
  const { accessToken } = await mintDelegatedAccessToken(input.impersonateEmail, HOSTED_CALENDAR_SCOPE);

  const createRes = await fetch(`${CALENDAR_API_BASE}/calendars`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: input.summary, timeZone: "America/Bogota" })
  });
  const createJson = (await createRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!createRes.ok || !createJson.id) {
    throw new Error(createJson.error?.message || `Error creando el calendario (${createRes.status})`);
  }

  const aclRes = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(createJson.id)}/acl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", scope: { type: "user", value: input.shareWithEmail } })
  });
  if (!aclRes.ok) {
    const aclJson = (await aclRes.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(aclJson.error?.message || `Error compartiendo el calendario (${aclRes.status})`);
  }

  return { calendarId: createJson.id };
}
