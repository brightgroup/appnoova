import type { SupabaseClient } from "@supabase/supabase-js";
import { getVehicleValuesByPlate, VerifikApiError } from "@/lib/insurers/verifik";
import { getVehicleValueByPlate, PlacApiError } from "@/lib/insurers/placapi";
import { getInsurerCredentials } from "@/lib/insurers/insurer-connections-db";
import { readSetting, saveSetting } from "@/lib/call-engine/platform-config";

export type VehicleDataProviderKey = "verifik" | "placapi";

export const VEHICLE_DATA_PROVIDER_KEY = "vehicle_data_provider";

export interface VehicleDataProviderRules {
  provider: VehicleDataProviderKey;
}

/**
 * PlacApi es el default desde el 2026-09-09 — confirmado con una consulta
 * real (placa+documento reales, devolvió avalúo completo) y es 5-15x más
 * barato que Verifik para el mismo dato. Cámbialo desde /admin/seguros si
 * hace falta volver a Verifik.
 */
export const DEFAULT_VEHICLE_DATA_PROVIDER_RULES: VehicleDataProviderRules = { provider: "placapi" };

export async function getVehicleDataProviderRules(db: SupabaseClient): Promise<VehicleDataProviderRules> {
  return readSetting(db, VEHICLE_DATA_PROVIDER_KEY, DEFAULT_VEHICLE_DATA_PROVIDER_RULES);
}

export async function saveVehicleDataProviderRules(
  db: SupabaseClient,
  rules: VehicleDataProviderRules,
  updatedBy?: string | null
): Promise<void> {
  await saveSetting(db, VEHICLE_DATA_PROVIDER_KEY, rules, updatedBy);
}

export interface VehicleLookupResult {
  marca: string;
  linea: string;
  clase?: string;
  categoria?: string;
  combustible?: string;
  codigo_fasecolda?: string;
  /** Año/modelo del vehículo. */
  modelo?: number;
  /** Valor comercial de referencia, en COP (no en miles). */
  valor_comercial?: number;
}

interface ResolvedProvider {
  key: VehicleDataProviderKey;
  requiresOwnerDocument: boolean;
  usingOwnAccount: boolean;
  lookup(plate: string, ownerDocument: string | undefined): Promise<VehicleLookupResult>;
}

function mapVerifik(v: Awaited<ReturnType<typeof getVehicleValuesByPlate>>): VehicleLookupResult {
  const modelo = v.year ? Number(v.year) : undefined;
  const matchingYear = v.valueModel?.find(m => Number(m.modelo) === modelo);
  // Verifik reporta el valor en miles de COP (confirmado contra un caso real:
  // Jetta 2011 con valores 2008-2015 entre 27.900 y 45.100, consistentes con
  // $27.9M-$45.1M) — se multiplica por 1000 para dejarlo en COP planos, igual
  // que PlacApi (que sí devuelve el valor completo).
  const valorComercial = matchingYear?.valor ? Number(matchingYear.valor) * 1000 : undefined;
  return {
    marca: v.marke,
    linea: [v.line1, v.line2, v.line3].filter(Boolean).join(" "),
    clase: v.class,
    categoria: v.category,
    combustible: v.fuel,
    codigo_fasecolda: v.homoloCode,
    modelo,
    valor_comercial: valorComercial
  };
}

function mapPlacApi(v: Awaited<ReturnType<typeof getVehicleValueByPlate>>): VehicleLookupResult {
  return {
    marca: String(v.marca ?? ""),
    linea: String(v.linea ?? ""),
    clase: v.clase,
    categoria: v.categoria,
    combustible: v.combustible,
    codigo_fasecolda: v.codigo ?? v.codigoHomologado,
    modelo: v.modelo,
    valor_comercial: v.valorComercial
  };
}

/**
 * Resuelve qué cuenta usar para consultar datos del vehículo: primero la
 * propia del corredor (cualquiera de los dos proveedores que haya
 * conectado), y si no conectó ninguna, la cuenta compartida de Noova según
 * el proveedor elegido en /admin/seguros (platform_settings).
 */
export async function resolveVehicleDataProvider(
  db: SupabaseClient,
  organizationId: string
): Promise<ResolvedProvider> {
  const ownPlacApi = await getInsurerCredentials<{ apiKey: string }>(db, organizationId, "placapi");
  if (ownPlacApi) {
    return {
      key: "placapi",
      requiresOwnerDocument: true,
      usingOwnAccount: true,
      lookup: async (plate, ownerDocument) =>
        mapPlacApi(await getVehicleValueByPlate(plate, ownerDocument ?? "", ownPlacApi.credentials.apiKey))
    };
  }

  const ownVerifik = await getInsurerCredentials<{ token: string }>(db, organizationId, "verifik");
  if (ownVerifik) {
    return {
      key: "verifik",
      requiresOwnerDocument: false,
      usingOwnAccount: true,
      lookup: async (plate) => mapVerifik(await getVehicleValuesByPlate(plate, ownVerifik.credentials.token))
    };
  }

  const { provider } = await getVehicleDataProviderRules(db);
  if (provider === "placapi") {
    return {
      key: "placapi",
      requiresOwnerDocument: true,
      usingOwnAccount: false,
      lookup: async (plate, ownerDocument) => mapPlacApi(await getVehicleValueByPlate(plate, ownerDocument ?? ""))
    };
  }
  return {
    key: "verifik",
    requiresOwnerDocument: false,
    usingOwnAccount: false,
    lookup: async (plate) => mapVerifik(await getVehicleValuesByPlate(plate))
  };
}

export function isVehicleProviderApiError(err: unknown): err is VerifikApiError | PlacApiError {
  return err instanceof VerifikApiError || err instanceof PlacApiError;
}
