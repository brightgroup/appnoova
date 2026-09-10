/** Cliente delgado para la API REST de Paddle (server-side only). */

function paddleApiKey(): string {
  const key = process.env.PADDLE_API_KEY?.trim();
  if (!key) throw new Error("PADDLE_API_KEY no configurada");
  return key;
}

/** Coolify/producción usan PADDLE_ENV=live; la key solo se usa si ENV no está. */
export function getPaddleMode(): "live" | "sandbox" {
  const env = process.env.PADDLE_ENV?.trim().toLowerCase();
  if (env === "live" || env === "production") return "live";
  if (env === "sandbox") return "sandbox";
  const key = process.env.PADDLE_API_KEY?.trim() ?? "";
  if (key.startsWith("pdl_live")) return "live";
  return "sandbox";
}

function paddleBaseUrl(): string {
  return getPaddleMode() === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function assertPaddleKeyMatchesMode(): void {
  const mode = getPaddleMode();
  const key = paddleApiKey();
  if (mode === "live" && key.startsWith("pdl_sdbx")) {
    throw new Error(
      "PADDLE_KEY_ENV_MISMATCH: PADDLE_ENV es live pero PADDLE_API_KEY es de sandbox. En Coolify usa la clave live (empieza por pdl_live_)."
    );
  }
  if (mode === "sandbox" && key.startsWith("pdl_live")) {
    throw new Error(
      "PADDLE_KEY_ENV_MISMATCH: PADDLE_ENV es sandbox pero PADDLE_API_KEY es de live. Alinea ENV y la clave."
    );
  }
}

async function paddleRequest<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ data?: T; meta?: { pagination?: { has_more?: boolean } } }> {
  const method = (init?.method ?? "GET").toUpperCase();
  assertPaddleKeyMatchesMode();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${paddleApiKey()}`,
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (method !== "GET" && method !== "HEAD" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${paddleBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const json = (await res.json()) as {
    data?: T;
    error?: { code?: string; detail?: string };
    meta?: { pagination?: { has_more?: boolean } };
  };
  if (!res.ok) {
    const code = json?.error?.code as string | undefined;
    const message = json?.error?.detail || code || res.statusText;
    throw new PaddleApiError(res.status, code, message);
  }
  return json;
}

export async function paddleFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const json = await paddleRequest<T>(path, init);
  return json.data as T;
}

export class PaddleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    detail: string
  ) {
    super(`Paddle API error ${status}: ${detail}`);
    this.name = "PaddleApiError";
  }
}

export interface PaddleCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface PaddleTransaction {
  id: string;
  status: string;
  customer_id?: string | null;
  subscription_id?: string | null;
  currency_code?: string;
  custom_data?: Record<string, unknown> | null;
  items: { price?: { id?: string } }[];
  billing_period?: { starts_at?: string; ends_at?: string } | null;
  details?: {
    totals?: { total?: string; currency_code?: string };
  };
  customer?: PaddleCustomer | null;
}

export async function getPaddleTransaction(transactionId: string): Promise<PaddleTransaction> {
  return paddleFetch<PaddleTransaction>(
    `/transactions/${encodeURIComponent(transactionId)}?include=customer`
  );
}

const TXN_ID_RE = /^txn_[a-z0-9]{26}$/i;
const TXN_ID_ONE_SHORT_RE = /^txn_[a-z0-9]{25}$/i;
const PADDLE_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

async function transactionExists(transactionId: string): Promise<boolean> {
  try {
    await paddleFetch(`/transactions/${encodeURIComponent(transactionId)}`);
    return true;
  } catch (err) {
    if (
      err instanceof PaddleApiError &&
      (err.status === 404 || err.code === "invalid_url" || err.code === "not_found")
    ) {
      return false;
    }
    throw err;
  }
}

async function completeTruncatedTxnId(prefix: string): Promise<string | null> {
  const hits: string[] = [];
  for (const ch of PADDLE_ID_ALPHABET) {
    const candidate = prefix + ch;
    if (await transactionExists(candidate)) hits.push(candidate);
    if (hits.length > 1) return null;
  }
  return hits[0] ?? null;
}

async function listRecentPaidTransactions(): Promise<PaddleTransaction[]> {
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 86_400_000).toISOString();
  const out: PaddleTransaction[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const qs = [
      "status=completed,paid,billed",
      "per_page=30",
      `created_at[GTE]=${encodeURIComponent(from)}`,
      `created_at[LTE]=${encodeURIComponent(to)}`,
    ];
    if (after) qs.push(`after=${encodeURIComponent(after)}`);
    const json = await paddleRequest<PaddleTransaction[]>(`/transactions?${qs.join("&")}`);
    const rows = json.data ?? [];
    out.push(...rows);
    if (!json.meta?.pagination?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id;
    if (!after) break;
  }
  return out;
}

/**
 * El ID de Paddle es `txn_` + 26 caracteres. Si quedó truncado al registrar el
 * cobro a mano, completamos el último carácter o buscamos por fecha.
 */
export async function resolvePaddleTransactionId(raw: string): Promise<string> {
  const id = raw.trim();
  if (TXN_ID_RE.test(id)) return id;

  let listed: PaddleTransaction[] = [];
  try {
    listed = await listRecentPaidTransactions();
  } catch (err) {
    console.warn("[paddle] no se pudo listar transacciones recientes", err);
  }
  const byPrefix = listed.filter(
    (t) => typeof t?.id === "string" && (t.id.startsWith(id) || id.startsWith(t.id))
  );
  if (byPrefix.length === 1) return byPrefix[0].id;

  if (TXN_ID_ONE_SHORT_RE.test(id)) {
    const completed = await completeTruncatedTxnId(id);
    if (completed) return completed;
  }

  return id;
}

export async function getPaddleCustomer(customerId: string): Promise<PaddleCustomer> {
  return paddleFetch<PaddleCustomer>(`/customers/${customerId}`);
}

/** Link temporal (~1h) al PDF de factura/recibo de Paddle (Merchant of Record). */
export async function getPaddleInvoicePdfUrl(
  transactionId: string,
  disposition: "inline" | "attachment" = "attachment"
): Promise<string> {
  const id = encodeURIComponent(transactionId);
  const paths = [
    `/transactions/${id}/invoice`,
    `/transactions/${id}/invoice?disposition=${disposition}`,
  ];
  let lastError: unknown;
  for (const path of paths) {
    try {
      const data = await paddleFetch<{ url: string }>(path, { signal: AbortSignal.timeout(15_000) });
      if (data?.url) return data.url;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Paddle no devolvió URL de factura");
}

/** Crea una transacción en borrador para abrir el overlay checkout desde el frontend. */
export async function createPaddleCheckoutTransaction(params: {
  priceId: string;
  organizationId: string;
  /**
   * Datos propios para identificar de qué se trata la transacción en el
   * webhook — dos objetos internos (planes, paquetes de créditos) pueden
   * compartir el mismo price_id de Paddle, así que el webhook no puede
   * reconstruir el significado solo a partir del price_id. Ej.
   * `{ plan_id }` para un plan, `{ kind: "topup", package_id }` para una
   * compra de créditos.
   */
  customData?: Record<string, string>;
  customerEmail?: string;
}): Promise<PaddleTransaction> {
  const checkoutUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://app.noova360.com"
  ).replace(/\/$/, "") + "/dashboard/facturacion";

  return paddleFetch<PaddleTransaction>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: params.priceId, quantity: 1 }],
      custom_data: { organization_id: params.organizationId, ...params.customData },
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

export interface PaddlePaymentMethod {
  id: string;
  type: string; // "card" | "paypal" | ...
  card?: {
    type?: string; // "visa" | "mastercard" | ...
    last4?: string;
    expiry_month?: number;
    expiry_year?: number;
  } | null;
}

/** Métodos de pago guardados por el cliente (para mostrar "Visa •••• 4242" en la UI). */
export async function listPaddlePaymentMethods(customerId: string): Promise<PaddlePaymentMethod[]> {
  const res = await paddleFetch<PaddlePaymentMethod[]>(`/customers/${customerId}/payment-methods`);
  return res ?? [];
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
