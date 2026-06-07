import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-server";
import { getTelephonyProvider } from "@/lib/telephony";
import type { TelephonyProvider } from "@/types/phone-number";

/** GET /api/admin/telephony/search?country=US&area_code=415&limit=25&number_type=local */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const country = (searchParams.get("country") ?? "US").toUpperCase();
  const area_code = searchParams.get("area_code") ?? undefined;
  const contains = searchParams.get("contains") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50);
  const providerId = (searchParams.get("provider") as TelephonyProvider | null) ?? "telnyx";

  const numberTypeParam = searchParams.get("number_type");
  const phone_number_type =
    numberTypeParam === "all" || numberTypeParam === ""
      ? null
      : numberTypeParam ?? undefined;

  const featuresParam = searchParams.get("features");
  const features = featuresParam
    ? featuresParam.split(",").map(f => f.trim()).filter(Boolean)
    : undefined;

  const bestEffortParam = searchParams.get("best_effort");
  const best_effort =
    bestEffortParam === "false" ? false : bestEffortParam === "true" ? true : undefined;

  const provider = getTelephonyProvider(providerId);
  if (!provider.isConfigured()) {
    return NextResponse.json(
      { error: `Proveedor ${provider.id} no configurado. Revisa variables de entorno.` },
      { status: 503 }
    );
  }

  try {
    const result = await provider.searchAvailable({
      country_code: country,
      area_code,
      contains,
      limit,
      phone_number_type,
      features,
      best_effort
    });
    return NextResponse.json({
      numbers: result.numbers,
      total_results: result.total_results,
      provider: provider.id,
      country
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al buscar números";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
