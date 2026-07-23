/** Cliente centralizado de email transaccional vía Resend. */

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string; detail?: string };

const DEFAULT_FROM = "Noova 360 <onboarding@resend.dev>";

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
}

/** Extrae email y nombre de `"Nombre <correo@dominio.com>"`. */
export function parseFromAddress(from: string): { email: string; name?: string } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}

/**
 * Remitente para correos que le llegan al cliente FINAL de una organización
 * (ej. confirmación de cita) — usa la misma dirección/dominio verificado en
 * Resend, pero con el nombre visible de la empresa del cliente en vez de
 * "Noova 360", para que no le llegue un correo de una marca que no reconoce.
 * Los correos internos al propio equipo de la organización (notify_team)
 * siguen usando `getResendFromEmail()` tal cual, sin este ajuste.
 */
export function buildContactFacingFromAddress(organizationName: string | null): string {
  const base = parseFromAddress(getResendFromEmail());
  const name = organizationName?.trim() ? `${organizationName.trim()} (vía Noova)` : base.name || "Noova 360";
  return `${name} <${base.email}>`;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY no configurada");
    return { sent: false, reason: "no_api_key" };
  }

  const to = Array.isArray(params.to) ? params.to : [params.to];
  if (!to.length) {
    return { sent: false, reason: "no_recipients" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: params.from ?? getResendFromEmail(),
      to,
      subject: params.subject,
      html: params.html
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[email] Resend error:", res.status, err);
    return { sent: false, reason: "send_failed", detail: err.slice(0, 500) };
  }

  let id: string | undefined;
  try {
    const body = (await res.json()) as { id?: string };
    id = body.id;
  } catch {
    /* ignore */
  }

  return { sent: true, id };
}
