import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { slugifyPropertyKey, toCrmPropertyDefinition } from "@/lib/crm-record";
import { getCrmProperties } from "@/lib/crm-server";
import type { CrmPropertyEntity } from "@/types/crm";

function parseEntity(raw: string | null): CrmPropertyEntity | null {
  if (raw === "contact" || raw === "lead") return raw;
  return null;
}

export async function GET(req: NextRequest) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

  const entityType = parseEntity(req.nextUrl.searchParams.get("entity"));
  if (!entityType) return NextResponse.json({ error: "entity requerido (contact|lead)" }, { status: 400 });

  try {
    const db = textAgentsAdminClient();
    const properties = await getCrmProperties(db, userId, entityType);
    return NextResponse.json({ properties, dbReady: true });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ properties: [], dbReady: false }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const body = await req.json();
  const entityType = parseEntity(String(body.entity_type ?? ""));
  const label = String(body.label ?? "").trim();
  if (!entityType || !label) {
    return NextResponse.json({ error: "entity_type y label son requeridos" }, { status: 400 });
  }

  const fieldKey = String(body.field_key ?? slugifyPropertyKey(label)).trim() || slugifyPropertyKey(label);
  const db = textAgentsAdminClient();

  const { count } = await db
    .from("crm_property_definitions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", entityType);

  const { data, error } = await db
    .from("crm_property_definitions")
    .insert({
      user_id: userId,
      entity_type: entityType,
      field_key: fieldKey,
      label,
      field_type: String(body.field_type ?? "text"),
      options: Array.isArray(body.options) ? body.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [],
      is_required: Boolean(body.is_required),
      group_name: String(body.group_name ?? "Personalizado").trim() || "Personalizado",
      sort_order: count ?? 0
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ property: toCrmPropertyDefinition(data) });
}

export async function PUT(req: NextRequest) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const body = await req.json();
  const entityType = parseEntity(String(body.entity_type ?? ""));
  const propertiesIn = Array.isArray(body.properties) ? body.properties : [];
  if (!entityType || !propertiesIn.length) {
    return NextResponse.json({ error: "entity_type y properties requeridos" }, { status: 400 });
  }

  const db = textAgentsAdminClient();
  const rows = propertiesIn.map((p: Record<string, unknown>, i: number) => ({
    user_id: userId,
    entity_type: entityType,
    field_key: String(p.field_key ?? slugifyPropertyKey(String(p.label ?? `field_${i}`))),
    label: String(p.label ?? "").trim(),
    field_type: String(p.field_type ?? "text"),
    options: Array.isArray(p.options) ? p.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [],
    is_builtin: Boolean(p.is_builtin),
    is_required: Boolean(p.is_required),
    group_name: String(p.group_name ?? "Personalizado").trim() || "Personalizado",
    sort_order: Number(p.sort_order ?? i),
    updated_at: new Date().toISOString()
  })).filter(r => r.label);

  await db
    .from("crm_property_definitions")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("is_builtin", false);

  const { data, error } = await db.from("crm_property_definitions").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = await getCrmProperties(db, userId, entityType);
  return NextResponse.json({ properties: all });
}
