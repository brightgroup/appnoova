import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-server";
import { adminClient } from "@/lib/voice-agents-server";
import {
  creditsPerUsdFromTiers,
  monthlyCreditsFromPriceUsd,
} from "@/lib/billing/plan-credits";
import { publishPricingChange } from "@/lib/billing/pricing-revision";

function slugifyId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `pkg_${base || "custom"}_${Date.now().toString(36).slice(-4)}`;
}

/** GET — listar paquetes */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = adminClient();
  const { data, error } = await db.from("plans").select("*").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data ?? [] });
}

/** POST — crear paquete personalizado (precio editable). */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const id = String(body.id ?? "").trim() || slugifyId(name);
  const db = adminClient();

  const { data: existing } = await db.from("plans").select("id").eq("id", id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ya existe un paquete con ese ID" }, { status: 409 });
  }

  const { data: systemPlans } = await db
    .from("plans")
    .select("price_usd, monthly_credits")
    .eq("is_system", true);

  const priceUsd = Number(body.price_usd ?? 0);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return NextResponse.json({ error: "Precio USD requerido (> 0)" }, { status: 400 });
  }

  const ratio = creditsPerUsdFromTiers(systemPlans ?? []);
  const monthlyCredits =
    body.monthly_credits != null
      ? Math.round(Number(body.monthly_credits))
      : monthlyCreditsFromPriceUsd(priceUsd, ratio);

  if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
    return NextResponse.json({ error: "Créditos mensuales inválidos" }, { status: 400 });
  }

  const { data, error } = await db
    .from("plans")
    .insert({
      id,
      name,
      price_usd: priceUsd,
      monthly_credits: monthlyCredits,
      trial_days: Number(body.trial_days ?? 0),
      whatsapp_included: Boolean(body.whatsapp_included),
      max_text_agents: body.max_text_agents != null ? Number(body.max_text_agents) : null,
      max_users: body.max_users != null ? Number(body.max_users) : null,
      support_level: String(body.support_level ?? "email"),
      sort_order: Number(body.sort_order ?? 100),
      is_active: body.is_active !== false,
      is_system: false,
      is_public: false,
      features: body.features ?? {},
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const revision = await publishPricingChange(db, auth.userId);
  return NextResponse.json({ plan: data, revision });
}
