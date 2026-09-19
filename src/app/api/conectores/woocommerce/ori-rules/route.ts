import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { normalizeWooCommerceRules } from "@/lib/woocommerce/rules";

/**
 * Permiso de WooCommerce para Ori (copiloto interno) — a nivel de
 * organización (`organizations.woocommerce_ori_rules`), no por agente: Ori no
 * es una fila en text_agents/voice_agents, así que no tiene una página de
 * "reglas por agente" como los agentes de texto (ver woocommerce_rules ahí).
 */
export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const { data } = await db.from("organizations").select("woocommerce_ori_rules").eq("id", orgCtx.organizationId).maybeSingle();

  return NextResponse.json({ rules: normalizeWooCommerceRules(data?.woocommerce_ori_rules) });
}

export async function PATCH(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const rules = normalizeWooCommerceRules(body?.rules);

  const db = adminClient();
  const { error } = await db.from("organizations").update({ woocommerce_ori_rules: rules }).eq("id", orgCtx.organizationId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules });
}
