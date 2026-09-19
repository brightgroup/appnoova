import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";
import { getWooCommerceConnection, getActiveWooCommerceConnectionSecrets } from "@/lib/woocommerce/connections-db";

export async function GET(req: NextRequest) {
  const orgCtx = await requireOrgModule(req, "conectores", "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const connection = await getWooCommerceConnection(db, orgCtx.organizationId);
  // El secreto se vuelve a mostrar (a diferencia del Consumer Key/Secret, que
  // quedan ocultos una vez guardados): el usuario lo necesita cada vez que
  // crea un webhook nuevo en su WooCommerce, para el campo "Secreto".
  const secrets = connection?.status === "active" ? await getActiveWooCommerceConnectionSecrets(db, orgCtx.organizationId) : null;

  return NextResponse.json({ connection, webhookSecret: secrets?.webhookSecret ?? null });
}
