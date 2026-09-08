/**
 * Cliente de Verifik — consulta de datos del vehículo por placa (RUNT +
 * valor/código Fasecolda), sin convenio con ninguna aseguradora. El código
 * Fasecolda es la llave con la que toda aseguradora colombiana tarifa autos;
 * es el insumo que alimenta el conector de cada aseguradora (ver
 * src/lib/insurers/la-equidad.ts). No es un servicio por tenant: usa una
 * única cuenta/API key de Noova (VERIFIK_TOKEN), no credenciales del corredor.
 */

const BASE_URL = "https://api.verifik.co";
const REQUEST_TIMEOUT_MS = 15_000;

export interface VerifikFasecoldaValueByPlate {
  marke: string;
  line1?: string;
  line2?: string;
  line3?: string;
  plate: string;
  class?: string;
  category?: string;
  fuel?: string;
  bcpp?: string;
  valueModel?: Array<{ modelo?: string; valor?: string; estado?: string }>;
  homoloCode?: string;
  [key: string]: unknown;
}

export class VerifikApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "VerifikApiError";
  }
}

function getApiToken(orgToken?: string): string {
  const token = orgToken?.trim() || process.env.VERIFIK_TOKEN?.trim();
  if (!token) {
    throw new Error("Falta VERIFIK_TOKEN en el entorno (token de la cuenta Verifik de Noova).");
  }
  return token;
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

/**
 * Placa -> marca/línea/modelo/valor comercial/código Fasecolda.
 * `orgToken`: si el corredor conectó su propia cuenta de Verifik (ver
 * insurer_connections, provider_key "verifik"), se usa esa en vez de la
 * cuenta compartida de Noova (VERIFIK_TOKEN) — ver auto-quote-tool.ts.
 */
export async function getVehicleValuesByPlate(
  plate: string,
  orgToken?: string
): Promise<VerifikFasecoldaValueByPlate> {
  const normalizedPlate = plate.replace(/[\s.-]/g, "").toUpperCase();
  const url = `${BASE_URL}/v2/co/fasecolda/values-by-plate?plate=${encodeURIComponent(normalizedPlate)}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiToken(orgToken)}`
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new VerifikApiError(`Verifik devolvió un error (HTTP ${res.status})`, res.status, data);
  }
  // La respuesta real viene envuelta en {data: {...campos del vehículo...},
  // signature, id} — devolver `data` (el sobre completo) sin desempacar
  // dejaba marke/line1/homoloCode/etc. como undefined en todos los casos.
  const vehicle = data && typeof data === "object" && "data" in data ? data.data : data;
  return vehicle as VerifikFasecoldaValueByPlate;
}
