import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "@/lib/telephony/e164";

/**
 * Cruce de tomador contra crm_contacts, compartido por la importación de
 * Excel y el sync de Softseguros. Orden de búsqueda: documento_id (más
 * confiable) → teléfono (normalizado a E.164) → nombre exacto. Si no
 * encuentra nada, crea el contacto — inserción mínima, los demás campos de
 * la ficha (029_crm_contact_ficha.sql) tienen default y se completan luego
 * a mano si hace falta.
 */
export interface PolizaContactInput {
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  fuenteOrigen: "importacion_polizas" | "softseguros";
}

export async function findOrCreateContactForPoliza(
  db: SupabaseClient,
  userId: string,
  input: PolizaContactInput
): Promise<{ contactId: string; created: boolean }> {
  const documento = input.documento?.trim() || null;
  const telefonoE164 = input.telefono ? toE164(input.telefono) : "";
  const nombre = input.nombre.trim();

  if (documento) {
    const { data } = await db
      .from("crm_contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("documento_id", documento)
      .maybeSingle();
    if (data) return { contactId: data.id as string, created: false };
  }

  if (telefonoE164) {
    const { data } = await db
      .from("crm_contacts")
      .select("id, telefono, whatsapp")
      .eq("user_id", userId)
      .or(`telefono.eq.${telefonoE164},whatsapp.eq.${telefonoE164}`);
    const match = (data ?? []).find(
      row => toE164(String(row.telefono ?? "")) === telefonoE164 || toE164(String(row.whatsapp ?? "")) === telefonoE164
    );
    if (match) return { contactId: match.id as string, created: false };
  }

  if (nombre) {
    const { data } = await db.from("crm_contacts").select("id").eq("user_id", userId).ilike("name", nombre).maybeSingle();
    if (data) return { contactId: data.id as string, created: false };
  }

  const { data: created, error } = await db
    .from("crm_contacts")
    .insert({
      user_id: userId,
      name: nombre || "Sin nombre",
      documento_id: documento,
      telefono: telefonoE164 || null,
      phone: telefonoE164 || null,
      tipo_relacion: "cliente",
      fuente_origen: input.fuenteOrigen,
      source: input.fuenteOrigen,
      estado_whatsapp: telefonoE164 ? "valido" : null
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(error?.message ?? "No se pudo crear el contacto");
  return { contactId: created.id as string, created: true };
}
