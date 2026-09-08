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
  planId: string;
  customerEmail?: string;
}): Promise<PaddleTransaction> {
  const checkoutUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com"
  ).replace(/\/$/, "") + "/dashboard/facturacion";

  return paddleFetch<PaddleTransaction>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: params.priceId, quantity: 1 }],
      // plan_id explícito: dos planes internos pueden compartir el mismo
      // price_id de Paddle (ej. un plan privado con precio idéntico a uno
      // público), así que el webhook no puede reconstruir el plan solo a
      // partir del price_id.
      custom_data: { organization_id: params.organizationId, plan_id: params.planId },
      checkout: { url: checkoutUrl },
      ...(params.customerEmail
        ? { customer: { email: params.customerEmail } }
        : {}),
    }),
  });
}

export interface PaddleSubscription {
  id: string;
  status: string;
  scheduled_change: { action: string; effective_at: string } | null;
}

/** Cancela al final del periodo ya pagado (nunca de inmediato, salvo que se pida explícito). */
export async function cancelPaddleSubscription(
  subscriptionId: string,
  effectiveFrom: "next_billing_period" | "immediately" = "next_billing_period"
): Promise<PaddleSubscription> {
  return paddleFetch<PaddleSubscription>(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: effectiveFrom }),
  });
}

/** Deshace una cancelación programada (antes de que se cumpla la fecha efectiva). */
export async function undoPaddleScheduledCancel(subscriptionId: string): Promise<PaddleSubscription> {
  return paddleFetch<PaddleSubscription>(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({ scheduled_change: null }),
  });
}

/**
 * Cobra de inmediato un ítem no recurrente contra el método de pago ya
 * guardado en una suscripción — sin abrir checkout. Es el mecanismo real
 * detrás de la recarga automática de créditos.
 */
export async function chargeSubscriptionOneOff(
  subscriptionId: string,
  priceId: string
): Promise<void> {
  await paddleFetch(`/subscriptions/${subscriptionId}/charge`, {
    method: "POST",
    body: JSON.stringify({
      effective_from: "immediately",
      items: [{ price_id: priceId, quantity: 1 }],
    }),
  });
}

/** URL de un solo uso al portal de cliente de Paddle (actualizar tarjeta, ver facturas). */
export async function createPaddlePortalSession(
  customerId: string,
  subscriptionIds: string[] = []
): Promise<{ urls: { general: { overview: string } } }> {
  return paddleFetch(`/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify({ subscription_ids: subscriptionIds }),
  });
}
