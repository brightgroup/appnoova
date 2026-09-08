/**
 * Adaptador de La Equidad Seguros — primer conector real de aseguradora de
 * Noova Seguros (ver /Users/johngarcia/.claude/plans/cheerful-munching-pike.md,
 * Fase 2). API pública confirmada viva (`api.laequidadseguros.coop`, Swagger
 * en /docs), sin trámite comercial previo para consultarla — a diferencia del
 * resto de aseguradoras del plan, que exigen pedir credenciales por canal
 * comercial (Nivel 1 de la Fase 2).
 *
 * Autenticación: OAuth2 password grant. La respuesta del token (`Token`
 * schema) no incluye `expires_in`, así que no se puede confiar en un TTL
 * exacto — se cachea con un TTL conservador y se reintenta una vez pidiendo
 * un token nuevo si el servidor responde 401.
 */

const BASE_URL = "https://api.laequidadseguros.coop";
const REQUEST_TIMEOUT_MS = 20_000;
// Conservador: no hay expires_in en la respuesta de auth/token. Preferimos
// pedir un token de más a arriesgarnos a usar uno vencido.
const TOKEN_CACHE_TTL_MS = 5 * 60_000;

export interface LaEquidadCredentials {
  usuario: string;
  contrasena: string;
}

export interface LaEquidadQuoteData {
  certificate_type: "N" | "M";
  branch: string;
  start_date: string;
  plan_code: string;
}

export type LaEquidadRoleEnum = string;
export type LaEquidadPersonType = "NATURAL" | "JURIDICA";

export interface LaEquidadPerson {
  vinculacion: LaEquidadRoleEnum;
  tipo_persona: LaEquidadPersonType;
  codigo: string;
  nombre: string;
  genero?: string | null;
  fecha_nacimiento?: string | null;
  email?: string | null;
  direccion?: string | null;
  telefono?: string | null;
}

export interface LaEquidadQuoteCreationRequest {
  Quote: LaEquidadQuoteData[];
  People: LaEquidadPerson[];
  Detail?: unknown[] | null;
}

export class LaEquidadApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "LaEquidadApiError";
  }
}

const tokenCache = new Map<string, { accessToken: string; fetchedAt: number }>();

function cacheKey(credentials: LaEquidadCredentials): string {
  return credentials.usuario;
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAccessToken(credentials: LaEquidadCredentials): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: credentials.usuario,
    password: credentials.contrasena
  });

  const res = await fetchWithTimeout(`${BASE_URL}/api/v2.2/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LaEquidadApiError(
      `La Equidad rechazó las credenciales (HTTP ${res.status})`,
      res.status,
      text
    );
  }

  const data = (await res.json()) as { access_token: string; token_type: string };
  const key = cacheKey(credentials);
  tokenCache.set(key, { accessToken: data.access_token, fetchedAt: Date.now() });
  return data.access_token;
}

async function getAccessToken(
  credentials: LaEquidadCredentials,
  forceRefresh = false
): Promise<string> {
  const key = cacheKey(credentials);
  const cached = tokenCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return cached.accessToken;
  }
  return requestAccessToken(credentials);
}

/** Llama con el token cacheado; si el servidor responde 401, pide un token nuevo y reintenta una sola vez. */
async function callAuthenticated<T>(
  credentials: LaEquidadCredentials,
  makeRequest: (accessToken: string) => Promise<Response>
): Promise<T> {
  let accessToken = await getAccessToken(credentials);
  let res = await makeRequest(accessToken);

  if (res.status === 401) {
    accessToken = await getAccessToken(credentials, true);
    res = await makeRequest(accessToken);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new LaEquidadApiError(
      `La Equidad devolvió un error (HTTP ${res.status})`,
      res.status,
      data
    );
  }
  return data as T;
}

/** Verifica que las credenciales del corredor sean válidas — usado al guardar la conexión. */
export async function testLaEquidadConnection(
  credentials: LaEquidadCredentials
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requestAccessToken(credentials);
    return { ok: true };
  } catch (e) {
    const message = e instanceof LaEquidadApiError ? e.message : "No se pudo conectar con La Equidad";
    return { ok: false, message };
  }
}

/**
 * Descubre en runtime los campos requeridos para cotizar un producto. Evita
 * cablear a mano el esquema de autos — se pide el `plan_code` (`pcodpla`)
 * del ramo autos y La Equidad devuelve la plantilla completa.
 */
export async function getQuoteTemplate(
  credentials: LaEquidadCredentials,
  params: { planCode: string; tipoOperacion: "N" | "M" }
): Promise<unknown> {
  return callAuthenticated(credentials, (accessToken) =>
    fetchWithTimeout(
      `${BASE_URL}/api/v2.2/quote-template?pcodpla=${encodeURIComponent(params.planCode)}&tipo_operacion=${params.tipoOperacion}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  );
}

/** Respuesta de POST /quotations — solo identificadores, no trae la prima (`QuoteSummaryResponse`). */
export interface LaEquidadQuoteSummary {
  sucur: string;
  codpla: string;
  certif: string;
  orden: number;
}

/** Cotiza un riesgo (p.ej. un auto) en La Equidad. Devuelve solo identificadores — la prima se pide aparte con getQuotationDetail. */
export async function createQuotation(
  credentials: LaEquidadCredentials,
  request: LaEquidadQuoteCreationRequest
): Promise<LaEquidadQuoteSummary> {
  return callAuthenticated(credentials, (accessToken) =>
    fetchWithTimeout(`${BASE_URL}/api/v2.2/quotations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    })
  );
}

/** `QuoteDetailResponse` — `caratula.vprima` es la prima cotizada. */
export interface LaEquidadQuoteDetail {
  caratula: {
    certif: string;
    sucur: string;
    codpla: string;
    fecini: string | null;
    fecter: string | null;
    vprima: number | null;
  };
  detalles: unknown[];
  coberturas: unknown[];
}

/** Trae el detalle (incluida la prima) de una cotización ya creada. */
export async function getQuotationDetail(
  credentials: LaEquidadCredentials,
  ids: LaEquidadQuoteSummary
): Promise<LaEquidadQuoteDetail> {
  return callAuthenticated(credentials, (accessToken) =>
    fetchWithTimeout(
      `${BASE_URL}/api/v2.2/quotations/${encodeURIComponent(ids.sucur)}/${encodeURIComponent(ids.codpla)}/${encodeURIComponent(ids.certif)}/${ids.orden}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
  );
}
