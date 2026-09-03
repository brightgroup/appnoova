/** Cliente delgado para la API REST de Paddle (server-side only). */

function paddleApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY no configurada");
  return key;
}

function paddleBaseUrl(): string {
  return process.env.PADDLE_ENV === "live"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export async function paddleFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${paddleBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paddleApiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.detail || json?.error?.code || res.statusText;
    throw new Error(`Paddle API error ${res.status}: ${message}`);
  }
  return json.data as T;
}

export interface PaddleTransaction {
  id: string;
  status: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  custom_data?: Record<string, unknown> | null;
  items: { price: { id: string } }[];
  details?: {
    totals?: { total: string; currency_code: string };
  };
}

/** Crea una transacción en borrador para abrir el overlay checkout desde el frontend. */
export async function createPaddleCheckoutTransaction(params: {
  priceId: string;
  organizationId: string;
  customerEmail?: string;
}): Promise<PaddleTransaction> {
  const checkoutUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com"
  ).replace(/\/$/, "") + "/dashboard/facturacion";

  return paddleFetch<PaddleTransaction>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: params.priceId, quantity: 1 }],
      custom_data: { organization_id: params.organizationId },
      checkout: { url: checkoutUrl },
      ...(params.customerEmail
        ? { customer: { email: params.customerEmail } }
        : {}),
    }),
  });
}
