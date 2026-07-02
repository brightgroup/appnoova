import { NextRequest, NextResponse } from "next/server";
import { textAgentsAdminClient } from "@/lib/text-agents-server";
import { getCrmUserId } from "@/lib/crm-auth";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { hasValidContactChannel } from "@/lib/crm-contactability";
import { manualProvenanceEntry } from "@/lib/crm-contact-provenance";
import { enrichCrmContact, toCrmContact } from "@/lib/crm-record";

export async function GET(req: NextRequest) {
  const userId = await getCrmUserId(req, "view");
  if (userId instanceof NextResponse) return userId;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const db = textAgentsAdminClient();

  let query = db.from("crm_contacts").select("*").eq("user_id", userId).order("updated_at", { ascending: false });

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,email.ilike.%${q}%,telefono.ilike.%${q}%,whatsapp.ilike.%${q}%,organizacion.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ contacts: [], dbReady: false }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: (data ?? []).map(r => toCrmContact(r)), dbReady: true });
}

export async function POST(req: NextRequest) {
  const userId = await getCrmUserId(req, "edit");
  if (userId instanceof NextResponse) return userId;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name es requerido" }, { status: 400 });

  const telefono = body.telefono ? String(body.telefono).trim() : body.phone ? String(body.phone).trim() : null;
  const whatsapp = body.whatsapp ? String(body.whatsapp).trim() : null;
  const email = body.email ? String(body.email).trim() : null;
  const now = new Date().toISOString();
  const entry = manualProvenanceEntry(userId);

  const draft = enrichCrmContact({
    id: "",
    user_id: userId,
    name,
    tipo_contacto: body.tipo_contacto === "empresa" ? "empresa" : "persona",
    documento_id: null,
    organizacion: body.organizacion ? String(body.organizacion).trim() : body.company ? String(body.company).trim() : null,
    whatsapp,
    telefono,
    email,
    canal_preferido: null,
    estado_whatsapp: whatsapp ? "valido" : null,
    estado_email: email ? "valido" : null,
    ultimo_inbound_wa: null,
    ventana_wa_estado: "sin_conversacion",
    supresiones: [],
    autorizacion_datos: Boolean(body.autorizacion_datos),
    autorizacion_datos_fecha: body.autorizacion_datos ? now : null,
    autorizacion_datos_fuente: body.autorizacion_datos ? "manual" : null,
    fuente_origen: body.fuente_origen ? String(body.fuente_origen) : body.source ? String(body.source).trim() : null,
    categorias_interes: [],
    ciudad: body.ciudad ? String(body.ciudad).trim() : null,
    tipo_relacion: "prospecto",
    asesor_asignado: null,
    inbox_conversation_id: null,
    field_provenance: { name: entry, ...(telefono ? { telefono: entry } : {}), ...(whatsapp ? { whatsapp: entry } : {}), ...(email ? { email: entry } : {}) },
    phone: telefono,
    company: body.organizacion ? String(body.organizacion).trim() : null,
    job_title: body.job_title ? String(body.job_title).trim() : null,
    source: body.fuente_origen ? String(body.fuente_origen) : null,
    notes: body.notes ? String(body.notes).trim() : null,
    tags: [],
    metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
    created_at: now,
    updated_at: now
  });

  if (!hasValidContactChannel(draft)) {
    return NextResponse.json(
      { error: "Debe existir al menos un canal de contacto válido (WhatsApp, teléfono o email)" },
      { status: 400 }
    );
  }

  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("crm_contacts")
    .insert({
      user_id: userId,
      name,
      tipo_contacto: draft.tipo_contacto,
      documento_id: body.documento_id ? String(body.documento_id).trim() : null,
      organizacion: draft.organizacion,
      company: draft.organizacion,
      whatsapp,
      telefono,
      phone: telefono,
      email,
      estado_whatsapp: draft.estado_whatsapp,
      estado_email: draft.estado_email,
      fuente_origen: draft.fuente_origen,
      source: draft.fuente_origen,
      ciudad: draft.ciudad,
      tipo_relacion: draft.tipo_relacion,
      job_title: draft.job_title,
      notes: draft.notes,
      autorizacion_datos: draft.autorizacion_datos,
      autorizacion_datos_fecha: draft.autorizacion_datos_fecha,
      autorizacion_datos_fuente: draft.autorizacion_datos_fuente,
      tags: [],
      categorias_interes: [],
      supresiones: [],
      metadata: draft.metadata,
      field_provenance: draft.field_provenance
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: toCrmContact(data) });
}
