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
 * Verifik queda como default hasta confirmar con una consulta real de PlacApi
 * (mapeo de campos y URL base sin verificar todavía, ver placapi.ts) —
 * cámbialo desde /admin/seguros una vez esté probado.
 */
export const DEFAULT_VEHICLE_DATA_PROVIDER_RULES: VehicleDataProviderRules = { provider: "verifik" };

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
}

interface ResolvedProvider {
  key: VehicleDataProviderKey;
  requiresOwnerDocument: boolean;
  usingOwnAccount: boolean;
  lookup(plate: string, ownerDocument: string | undefined): Promise<VehicleLookupResult>;
}

function mapVerifik(v: Awaited<ReturnType<typeof getVehicleValuesByPlate>>): VehicleLookupResult {
  return {
    marca: v.marke,
    linea: [v.line1, v.line2, v.line3].filter(Boolean).join(" "),
    clase: v.class,
    categoria: v.category,
    combustible: v.fuel,
    codigo_fasecolda: v.homoloCode
  };
}

function mapPlacApi(v: Awaited<ReturnType<typeof getVehicleValueByPlate>>): VehicleLookupResult {
  return {
    marca: String(v.marca ?? ""),
    linea: String(v.linea ?? ""),
    clase: v.clase,
    codigo_fasecolda: v.codigoFasecolda ?? v.codigoHomologado
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
