import { NextRequest, NextResponse } from "next/server";
import { requireOrgModule } from "@/lib/module-auth";
import { adminClient } from "@/lib/voice-agents-server";

const TIPO_PERSONA = new Set(["natural", "juridica"]);
const TIPO_DOCUMENTO = new Set(["CC", "NIT", "CE", "PA"]);

/** GET — datos fiscales guardados de la organización activa (o null si no ha llenado nada). */
export async function GET(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "view");
  if (ctx instanceof NextResponse) return ctx;

  const db = adminClient();
  const { data } = await db
    .from("organization_billing_profiles")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  return NextResponse.json({ profile: data ?? null });
}

/** PUT — crea/actualiza los datos fiscales (persona natural/jurídica, documento, razón social, dirección). */
export async function PUT(req: NextRequest) {
  const ctx = await requireOrgModule(req, "billing", "manage");
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json().catch(() => null)) as {
    tipo_persona?: string;
    tipo_documento?: string;
    numero_documento?: string;
    digito_verificacion?: string;
    razon_social?: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    email_facturacion?: string;
  } | null;

  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const tipo_persona = body.tipo_persona?.trim();
  const tipo_documento = body.tipo_documento?.trim().toUpperCase();
  const numero_documento = body.numero_documento?.trim();
  const razon_social = body.razon_social?.trim();

  if (!tipo_persona || !TIPO_PERSONA.has(tipo_persona)) {
    return NextResponse.json({ error: "tipo_persona debe ser 'natural' o 'juridica'" }, { status: 400 });
  }
  if (!tipo_documento || !TIPO_DOCUMENTO.has(tipo_documento)) {
    return NextResponse.json({ error: "tipo_documento debe ser CC, NIT, CE o PA" }, { status: 400 });
  }
  if (!numero_documento) {
    return NextResponse.json({ error: "numero_documento requerido" }, { status: 400 });
  }
  if (!razon_social) {
    return NextResponse.json({ error: "razon_social (nombre o razón social) requerido" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("organization_billing_profiles")
    .upsert(
      {
        organization_id: ctx.organizationId,
        tipo_persona,
        tipo_documento,
        numero_documento,
        digito_verificacion: body.digito_verificacion?.trim() || null,
        razon_social,
        direccion: body.direccion?.trim() || null,
        ciudad: body.ciudad?.trim() || null,
        telefono: body.telefono?.trim() || null,
        email_facturacion: body.email_facturacion?.trim() || null,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
