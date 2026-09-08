import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { getVehicleValuesByPlate, VerifikApiError } from "@/lib/insurers/verifik";

export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const placa = req.nextUrl.searchParams.get("placa")?.trim();
  if (!placa) {
    return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
  }

  try {
    const vehicle = await getVehicleValuesByPlate(placa);
    return NextResponse.json({ vehicle });
  } catch (err) {
    if (err instanceof VerifikApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 404 ? 404 : 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error consultando el vehículo" },
      { status: 500 }
    );
  }
}
