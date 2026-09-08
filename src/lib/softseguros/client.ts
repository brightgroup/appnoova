/**
 * Cliente de la API de Softseguros — confirmada real y documentada
 * (app.softseguros.com/docs/auth) el 2026-09-05, endpoints de pólizas,
 * siniestros, comisiones y clientes. Fase 2 del plan (S1 Cartera / S2
 * Renovaciones / S6 Comisiones), Camino A: solo lectura de lo que el
 * corredor ya tiene cargado — Noova nunca escribe pólizas nuevas acá.
 *
 * HONESTIDAD IMPORTANTE: la documentación pública confirma los ENDPOINTS y
 * el mecanismo de auth, pero no el detalle exacto de cada campo de
 * respuesta (ej. nombres exactos de los campos de una póliza) — eso solo se
 * puede verificar contra una cuenta real. Por eso las respuestas se tipan
 * como `Record<string, unknown>` en vez de interfaces detalladas que
 * fingirían estar verificadas.
 */

const BASE_URL = "https://app.softseguros.com";
const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_CACHE_TTL_MS = 30 * 60_000;

export interface SoftsegurosCredentials {
  username: string;
  password: string;
}

export class SoftsegurosApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "SoftsegurosApiError";
  }
}

const tokenCache = new Map<string, { token: string; fetchedAt: number }>();

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestToken(credentials: SoftsegurosCredentials): Promise<string> {
  const res = await fetchWithTimeout(`${BASE_URL}/api-token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: credentials.username, password: credentials.password })
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok || !data?.token) {
    throw new SoftsegurosApiError(
      `Softseguros rechazó las credenciales (HTTP ${res.status})`,
      res.status,
      data
    );
  }

  tokenCache.set(credentials.username, { token: data.token, fetchedAt: Date.now() });
  return data.token as string;
}

async function getToken(credentials: SoftsegurosCredentials, forceRefresh = false): Promise<string> {
  const cached = tokenCache.get(credentials.username);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return cached.token;
  }
  return requestToken(credentials);
}

async function callAuthenticated<T = Record<string, unknown>>(
  credentials: SoftsegurosCredentials,
  path: string,
  init?: RequestInit
): Promise<T> {
  let token = await getToken(credentials);
  let res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Token ${token}` }
  });

  if (res.status === 401) {
    token = await getToken(credentials, true);
    res = await fetchWithTimeout(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Token ${token}` }
    });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new SoftsegurosApiError(`Softseguros devolvió un error (HTTP ${res.status})`, res.status, data);
  }
  return data as T;
}

export async function testSoftsegurosConnection(
  credentials: SoftsegurosCredentials
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requestToken(credentials);
    return { ok: true };
  } catch (e) {
    const message = e instanceof SoftsegurosApiError ? e.message : "No se pudo conectar con Softseguros";
    return { ok: false, message };
  }
}

export interface SoftsegurosListResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Lista pólizas (paginado, 10 por página según la documentación). */
export async function listPolizas(
  credentials: SoftsegurosCredentials,
  params?: { page?: number }
): Promise<SoftsegurosListResponse> {
  const query = params?.page ? `?page=${params.page}` : "";
  return callAuthenticated(credentials, `/api/poliza/${query}`);
}

/** Lista siniestros (endpoint paginado propio, distinto del genérico). */
export async function listSiniestros(
  credentials: SoftsegurosCredentials,
  params?: { page?: number }
): Promise<SoftsegurosListResponse> {
  const query = params?.page ? `?page=${params.page}` : "";
  return callAuthenticated(credentials, `/api/siniestro/list_paginado/${query}`);
}

/** Marca un pago de póliza como comisionado — la mecánica exacta que describió el cliente real (Fase S6). */
export async function comisionarPago(
  credentials: SoftsegurosCredentials,
  pagoPolizaId: string | number
): Promise<Record<string, unknown>> {
  return callAuthenticated(credentials, `/api/pagopoliza/${pagoPolizaId}/comisionar/`, { method: "POST" });
}

/** Busca un cliente por número de documento — útil para cruzar un contacto de Noova con su registro en Softseguros. */
export async function buscarClientePorDocumento(
  credentials: SoftsegurosCredentials,
  documento: string
): Promise<Record<string, unknown>> {
  return callAuthenticated(
    credentials,
    `/api/cliente/listar_cliente_por_documento/?documento=${encodeURIComponent(documento)}`
  );
}
