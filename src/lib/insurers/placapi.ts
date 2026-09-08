/**
 * Cliente de PlacApi — alternativa a Verifik para el mismo dato (valor/código
 * Fasecolda por placa), evaluada 2026-09-08 por ser 5-15x más barata y cubrir
 * además SOAT/RTM/SIMIT en el mismo proveedor (ver [[project-softseguros-broker-ai-usecases]]).
 *
 * A diferencia de Verifik, el endpoint de avalúo exige placa + documento del
 * PROPIETARIO (no solo la placa) — se asume que es el mismo documento del
 * tomador que ya se le pide al cliente.
 *
 * PENDIENTE DE VERIFICAR: el mapeo de campos de `mapToVehicleShape` está
 * hecho sobre la descripción pública de la API (código FASECOLDA,
 * codigoHomologado, marca, línea, modelo, valorComercial, rangoMercado,
 * clase, fichaTecnica, valoresPorAnio) — NO contra una respuesta real
 * todavía. Confirmar los nombres exactos de los campos con la primera
 * consulta real antes de usarlo en producción.
 */

// PENDIENTE DE VERIFICAR TAMBIÉN: este host es una suposición (mismo patrón
// api.<dominio> que Verifik) — confirmar contra la documentación real de la
// cuenta antes de usarlo en producción.
const BASE_URL = "https://api.placapi.com";
const REQUEST_TIMEOUT_MS = 15_000;

export interface PlacApiVehicleValue {
  codigoFasecolda?: string;
  codigoHomologado?: string;
  marca?: string;
  linea?: string;
  modelo?: string | number;
  valorComercial?: number | string;
  rangoMercado?: { min?: number; max?: number };
  clase?: string;
  fichaTecnica?: Record<string, unknown>;
  valoresPorAnio?: Array<{ modelo?: string | number; valor?: number | string }>;
  [key: string]: unknown;
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

/** Placa + documento del propietario -> valor/código Fasecolda (ver nota de arriba: mapeo sin confirmar contra respuesta real). */
export async function getVehicleValueByPlate(
  plate: string,
  ownerDocument: string,
  apiKey?: string
): Promise<PlacApiVehicleValue> {
  const normalizedPlate = plate.replace(/[\s.-]/g, "").toUpperCase();
  const url = `${BASE_URL}/api/avaluo?placa=${encodeURIComponent(normalizedPlate)}&docNumber=${encodeURIComponent(ownerDocument.trim())}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiKey(apiKey)}`
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new PlacApiError(`PlacApi devolvió un error (HTTP ${res.status})`, res.status, data);
  }
  const value = data && typeof data === "object" && "data" in data ? (data as { data: unknown }).data : data;
  return value as PlacApiVehicleValue;
}
