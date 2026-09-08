import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  DEFAULT_VEHICLE_DATA_PROVIDER_RULES,
  getVehicleDataProviderRules,
  saveVehicleDataProviderRules,
  type VehicleDataProviderKey
} from "@/lib/insurers/vehicle-data-provider";

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const rules = await getVehicleDataProviderRules(db);
  return NextResponse.json({ rules, defaults: DEFAULT_VEHICLE_DATA_PROVIDER_RULES });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const provider: VehicleDataProviderKey = body.provider === "placapi" ? "placapi" : "verifik";

  const db = adminClient();
  await saveVehicleDataProviderRules(db, { provider }, auth.userId);
  return NextResponse.json({ rules: { provider } });
}
