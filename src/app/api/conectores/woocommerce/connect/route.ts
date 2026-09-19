import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { testWooCommerceConnection, WooCommerceApiError } from "@/lib/woocommerce/client";
import { upsertWooCommerceConnection } from "@/lib/woocommerce/connections-db";

/**
 * A diferencia de HubSpot/Softseguros, NO registramos los webhooks de
 * WooCommerce aquí: la URL de entrega depende del token de un nodo
 * `trigger.woocommerce_order`/`trigger.woocommerce_product` que el usuario
 * crea después, en el editor de Automations (ver node-types.ts) — ese token
 * no existe todavía en este punto. El secreto sí se genera y guarda acá
 * (una sola vez por conexión, no por nodo) para que el usuario lo copie al
 * crear el webhook manualmente en su WooCommerce, con la URL que el editor
 * le muestra en ese nodo.
 */
export async function POST(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const siteUrl = String(body?.site_url ?? "").trim();
  const consumerKey = String(body?.consumer_key ?? "").trim();
  const consumerSecret = String(body?.consumer_secret ?? "").trim();

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json({ error: "Faltan la URL de la tienda, el Consumer Key o el Consumer Secret" }, { status: 400 });
  }
  if (!/^https:\/\//i.test(siteUrl)) {
    return NextResponse.json({ error: "La URL de la tienda debe empezar con https:// (WooCommerce lo exige para Basic Auth)" }, { status: 400 });
  }

  const creds = { siteUrl, consumerKey, consumerSecret };
  try {
    await testWooCommerceConnection(creds);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof WooCommerceApiError ? err.message : "No se pudo validar la conexión con WooCommerce" },
      { status: 400 }
    );
  }

  const db = adminClient();
  try {
    const connection = await upsertWooCommerceConnection(db, {
      organizationId: orgCtx.organizationId,
      connectedByUserId: orgCtx.userId,
      siteUrl,
      consumerKey,
      consumerSecret,
      webhookSecret: randomBytes(32).toString("hex")
    });
    return NextResponse.json({ connection });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error guardando la conexión de WooCommerce" },
      { status: 500 }
    );
  }
}
