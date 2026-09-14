import { NextRequest, NextResponse } from "next/server";
import { requireSegurosAccess } from "@/lib/insurers/api-guard";
import { adminClient } from "@/lib/voice-agents-server";

/**
 * Ramos que la agencia realmente ofrece — contexto para agentes de IA y
 * futuros procesos, no un filtro que restrinja el campo "Ramo" del lead (ese
 * sigue mostrando el catálogo completo). Se guarda en
 * organizations.settings.seguros.ramos_ofrecidos (jsonb ya existente, mismo
 * lugar que settings.modules) — ramos_catalogo es global (sin
 * organization_id), así que no amerita una tabla nueva para esto.
 */
export async function GET(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "view");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const db = adminClient();
  const { data: org, error } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgCtx.organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings = (org?.settings as Record<string, unknown>) ?? {};
  const seguros = (settings.seguros as Record<string, unknown>) ?? {};
  const ramosOfrecidos = Array.isArray(seguros.ramos_ofrecidos) ? (seguros.ramos_ofrecidos as string[]) : [];

  return NextResponse.json({ ramos_ofrecidos: ramosOfrecidos });
}

export async function PATCH(req: NextRequest) {
  const orgCtx = await requireSegurosAccess(req, "edit");
  if (orgCtx instanceof NextResponse) return orgCtx;

  const body = await req.json().catch(() => ({}));
  const ramosOfrecidos = Array.isArray(body?.ramos_ofrecidos)
    ? body.ramos_ofrecidos.filter((r: unknown) => typeof r === "string")
    : null;
  if (!ramosOfrecidos) {
    return NextResponse.json({ error: "ramos_ofrecidos debe ser un arreglo de slugs" }, { status: 400 });
  }

  const db = adminClient();

  if (ramosOfrecidos.length > 0) {
    const { data: validRamos } = await db.from("ramos_catalogo").select("slug").in("slug", ramosOfrecidos);
    const validSlugs = new Set((validRamos ?? []).map(r => r.slug));
    const invalid = ramosOfrecidos.filter((r: string) => !validSlugs.has(r));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Ramo(s) desconocido(s): ${invalid.join(", ")}` }, { status: 400 });
    }
  }

  const { data: org, error: fetchError } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgCtx.organizationId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const settings = (org?.settings as Record<string, unknown>) ?? {};
  const prevSeguros = (settings.seguros as Record<string, unknown>) ?? {};
  const nextSettings = {
    ...settings,
    seguros: { ...prevSeguros, ramos_ofrecidos: ramosOfrecidos }
  };

  const { error: updateError } = await db
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", orgCtx.organizationId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ramos_ofrecidos: ramosOfrecidos });
}
