/**
 * Cliente de PlacApi — alternativa a Verifik para el mismo dato (valor/código
 * Fasecolda por placa), evaluada 2026-09-08 por ser 5-15x más barata y cubrir
 * además SOAT/RTM/SIMIT en el mismo proveedor (ver [[project-softseguros-broker-ai-usecases]]).
 *
 * A diferencia de Verifik, el endpoint de avalúo exige placa + documento del
 * PROPIETARIO (no solo la placa) — se asume que es el mismo documento del
 * tomador que ya se le pide al cliente.
 *
 * Auth/transporte y forma real de `data` confirmados 2026-09-09 con una
 * consulta real completa (placa+documento reales, placa "RIL102"): POST,
 * `x-api-key`, body JSON, respuesta {source, status, data, error, mode}
 * con `data` = PlacApiVehicleValue de abajo.
 */

const BASE_URL = "https://placapi.com";
const REQUEST_TIMEOUT_MS = 15_000;

export interface PlacApiVehicleValue {
  /** Código Fasecolda — este es el campo real, no "codigoFasecolda". */
  codigo?: string;
  codigoHomologado?: string;
  marca?: string;
  linea?: string;
  modelo?: number;
  valorComercial?: number;
  rangoMercado?: { min?: number; max?: number };
  clase?: string;
  categoria?: string;
  tipologia?: string;
  combustible?: string;
  transmision?: string;
  cilindraje?: number;
  origen?: string;
  fichaTecnica?: Record<string, unknown>;
  valoresPorAnio?: Array<{ modelo?: number; valor?: number; estado?: string }>;
  [key: string]: unknown;
}

interface PlacApiEnvelope {
  source?: string;
  status?: string;
  data?: PlacApiVehicleValue | null;
  error?: string;
  mode?: string;
}

export class PlacApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "PlacApiError";
  }
}

function getApiKey(orgKey?: string): string {
  const key = orgKey?.trim() || process.env.PLACAPI_API_KEY?.trim();
  if (!key) {
    throw new Error("Falta PLACAPI_API_KEY en el entorno (API key de la cuenta PlacApi de Noova).");
  }
  return key;
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

/** Placa + documento del propietario (debe coincidir con el registrado en RUNT) -> valor/código Fasecolda. */
export async function getVehicleValueByPlate(
  plate: string,
  ownerDocument: string,
  apiKey?: string,
  docType: string = "CC"
): Promise<PlacApiVehicleValue> {
  const normalizedPlate = plate.replace(/[\s.-]/g, "").toUpperCase();

  const res = await fetchWithTimeout(`${BASE_URL}/api/avaluo`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "content-type": "application/json",
      "x-api-key": getApiKey(apiKey)
    },
    body: JSON.stringify({ placa: normalizedPlate, docType, docNumber: ownerDocument.trim() })
  });

  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as PlacApiEnvelope | null;

  if (!res.ok) {
    throw new PlacApiError(`PlacApi devolvió un error (HTTP ${res.status})`, res.status, data);
  }
  if (!data?.data) {
    throw new PlacApiError(data?.error ?? "PlacApi no encontró el vehículo con esos datos.", res.status, data);
  }
  return data.data;
}
