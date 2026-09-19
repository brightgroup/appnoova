import type { WooCommerceConnectionSecrets } from "@/lib/woocommerce/connections-db";

/**
 * Cliente REST de WooCommerce. A diferencia de HubSpot/Softseguros, no hay un
 * host fijo de Noova ni un login que devuelva un token — cada organización
 * tiene su propio dominio WordPress (`siteUrl`) y se autentica con Basic Auth
 * usando el Consumer Key/Secret de su propia tienda (requiere HTTPS, método
 * documentado por WooCommerce para la REST API v3). No hay caché de sesión
 * porque no hay sesión: cada llamada lleva el header Basic completo.
 */

export class WooCommerceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "WooCommerceApiError";
  }
}

export interface WooCommerceCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

function authHeader(creds: WooCommerceCredentials): string {
  return "Basic " + Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
}

function baseUrl(creds: WooCommerceCredentials): string {
  return creds.siteUrl.replace(/\/+$/, "");
}

async function wooFetch<T>(creds: WooCommerceCredentials, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl(creds)}/wp-json/wc/v3${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  const rawBody = await res.text();
  let parsedBody: unknown = rawBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Respuesta no-JSON (ej. HTML de un 404 de WordPress mal configurado) — se usa el texto crudo.
  }

  if (!res.ok) {
    const message =
      (parsedBody && typeof parsedBody === "object" && "message" in parsedBody && typeof (parsedBody as { message?: unknown }).message === "string"
        ? (parsedBody as { message: string }).message
        : null) || `WooCommerce API error ${res.status}`;
    throw new WooCommerceApiError(message, res.status, parsedBody);
  }

  return parsedBody as T;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  sku: string;
  permalink: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  status: string;
  categories: { id: number; name: string }[];
  images: { src: string }[];
}

export interface WooCommerceOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  customer_note: string;
  billing: { first_name: string; last_name: string; phone: string; email: string };
  line_items: { name: string; quantity: number; total: string }[];
}

export function credentialsFromConnection(conn: WooCommerceConnectionSecrets): WooCommerceCredentials {
  return { siteUrl: conn.siteUrl, consumerKey: conn.consumerKey, consumerSecret: conn.consumerSecret };
}

export async function testWooCommerceConnection(creds: WooCommerceCredentials): Promise<void> {
  await wooFetch<WooCommerceProduct[]>(creds, "/products?per_page=1");
}

export async function buscarProductos(
  creds: WooCommerceCredentials,
  query: string,
  perPage = 5
): Promise<WooCommerceProduct[]> {
  const params = new URLSearchParams({ search: query, per_page: String(perPage), status: "publish" });
  return wooFetch<WooCommerceProduct[]>(creds, `/products?${params.toString()}`);
}

export async function obtenerPedido(creds: WooCommerceCredentials, id: number): Promise<WooCommerceOrder> {
  return wooFetch<WooCommerceOrder>(creds, `/orders/${id}`);
}

export async function buscarPedidos(
  creds: WooCommerceCredentials,
  filtros: { search?: string; status?: string },
  perPage = 5
): Promise<WooCommerceOrder[]> {
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (filtros.search) params.set("search", filtros.search);
  if (filtros.status) params.set("status", filtros.status);
  return wooFetch<WooCommerceOrder[]>(creds, `/orders?${params.toString()}`);
}

export async function actualizarProducto(
  creds: WooCommerceCredentials,
  id: number,
  cambios: { stock_quantity?: number; regular_price?: string; sale_price?: string }
): Promise<WooCommerceProduct> {
  return wooFetch<WooCommerceProduct>(creds, `/products/${id}`, { method: "PUT", body: JSON.stringify(cambios) });
}

export async function actualizarPedido(
  creds: WooCommerceCredentials,
  id: number,
  cambios: { status?: string; customer_note?: string }
): Promise<WooCommerceOrder> {
  return wooFetch<WooCommerceOrder>(creds, `/orders/${id}`, { method: "PUT", body: JSON.stringify(cambios) });
}

export interface WooCommerceWebhook {
  id: number;
}

/** Registra un webhook de WooCommerce (product.updated u order.created/order.updated) apuntando a nuestra URL pública. */
export async function registrarWebhook(
  creds: WooCommerceCredentials,
  input: { topic: "product.updated" | "order.created" | "order.updated"; deliveryUrl: string; secret: string; name: string }
): Promise<WooCommerceWebhook> {
  return wooFetch<WooCommerceWebhook>(creds, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      topic: input.topic,
      delivery_url: input.deliveryUrl,
      secret: input.secret,
      status: "active"
    })
  });
}

export async function eliminarWebhook(creds: WooCommerceCredentials, id: number): Promise<void> {
  await wooFetch(creds, `/webhooks/${id}?force=true`, { method: "DELETE" });
}
