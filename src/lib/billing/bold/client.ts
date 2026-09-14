/**
 * Cliente delgado para la API de Bold (Link de pagos) — server-side only.
 *
 * Mismo patrón que Paddle (`src/lib/billing/paddle/client.ts`): el código
 * siempre lee `BOLD_API_KEY`/`BOLD_WEBHOOK_SECRET`; las variantes `_LIVE` en
 * `.env.local` son solo referencia para copiar a Coolify cuando Bold verifique
 * la cuenta de producción — no las lee el código, se sustituye el valor de la
 * variable activa en ese momento.
 */

export type BoldMode = "live" | "sandbox";

function boldApiKey(): string {
  const key = process.env.BOLD_API_KEY?.trim();
  if (!key) throw new Error("BOLD_API_KEY no configurada");
  return key;
}

/** Solo informativo (logs/labels) — Coolify/producción usan BOLD_ENV=live cuando Bold verifique la cuenta. */
export function getBoldMode(): BoldMode {
  const env = process.env.BOLD_ENV?.trim().toLowerCase();
  if (env === "live" || env === "production") return "live";
  return "sandbox";
}

export function boldWebhookSecret(): string {
  return process.env.BOLD_WEBHOOK_SECRET?.trim() ?? "";
}

const LINK_BASE_URL = "https://integrations.api.bold.co";

export class BoldApiError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(`Bold API error ${status}: ${detail}`);
    this.name = "BoldApiError";
  }
}

async function boldFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LINK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `x-api-key ${boldApiKey()}`,
      Accept: "application/json",
      ...(init?.method && init.method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    payload?: T;
    errors?: { message?: string; code?: string }[];
  };
  if (!res.ok || (json.errors && json.errors.length > 0)) {
    const detail = json.errors?.map((e) => e.message || e.code).join("; ") || res.statusText;
    throw new BoldApiError(res.status, detail);
  }
  // La consulta de estado de un link devuelve el objeto plano (sin envolver
  // en `payload`), a diferencia de creación/listado — soportamos ambas formas.
  return (json.payload ?? json) as T;
}

export interface BoldPaymentLink {
  payment_link: string;
  url: string;
}

/**
 * Crea un link de pago de monto cerrado (CLOSE) en COP. `reference` debe ser
 * único por intento de cobro (recomendación de Bold para evitar choques) —
 * usamos el id de la fila `bold_payment_requests` que lo origina.
 */
export async function createBoldPaymentLink(params: {
  reference: string;
  /** Monto en la moneda indicada — USD (precio de catálogo) o COP. */
  amount: number;
  currency: "USD" | "COP";
  description: string;
  payerEmail?: string;
  callbackUrl?: string;
  paymentMethods?: ("CREDIT_CARD" | "PSE" | "NEQUI" | "BOTON_BANCOLOMBIA")[];
}): Promise<BoldPaymentLink> {
  return boldFetch<BoldPaymentLink>("/online/link/v1", {
    method: "POST",
    body: JSON.stringify({
      amount_type: "CLOSE",
      amount: {
        currency: params.currency,
        total_amount: params.amount,
        tip_amount: 0,
      },
      reference: params.reference,
      description: params.description,
      ...(params.payerEmail ? { payer_email: params.payerEmail } : {}),
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
      ...(params.paymentMethods ? { payment_methods: params.paymentMethods } : {}),
    }),
  });
}

export interface BoldPaymentLinkStatus {
  id: string;
  status: "ACTIVE" | "PROCESSING" | "PAID" | "REJECTED" | "CANCELLED" | "EXPIRED";
  total: number;
  transaction_id: string | null;
  reference: string;
}

export async function getBoldPaymentLinkStatus(paymentLink: string): Promise<BoldPaymentLinkStatus> {
  return boldFetch<BoldPaymentLinkStatus>(`/online/link/v1/${encodeURIComponent(paymentLink)}`);
}
