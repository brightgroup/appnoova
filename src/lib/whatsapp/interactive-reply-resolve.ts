import type { SupabaseClient } from "@supabase/supabase-js";

export async function savePendingInteractiveOptions(
  db: SupabaseClient,
  whatsappChannelId: string,
  contactE164: string,
  options: Record<string, string>
): Promise<void> {
  await db
    .from("whatsapp_pending_interactive_options")
    .upsert(
      { whatsapp_channel_id: whatsappChannelId, contact_e164: contactE164, options, created_at: new Date().toISOString() },
      { onConflict: "whatsapp_channel_id,contact_e164" }
    );
}

/**
 * Resuelve el `Body` entrante contra la última lista/botones enviados a este
 * contacto (Twilio list-picker manda el ID de la fila en `Body`, no su
 * texto). Si hay una coincidencia, devuelve el texto de la opción elegida;
 * si no, devuelve `body` sin tocar. Consume (borra) el pendiente en ambos
 * casos — es de un solo uso.
 */
export async function resolvePendingInteractiveReply(
  db: SupabaseClient,
  whatsappChannelId: string,
  contactE164: string,
  body: string
): Promise<string> {
  const { data } = await db
    .from("whatsapp_pending_interactive_options")
    .select("options")
    .eq("whatsapp_channel_id", whatsappChannelId)
    .eq("contact_e164", contactE164)
    .maybeSingle();

  if (!data) return body;

  await db
    .from("whatsapp_pending_interactive_options")
    .delete()
    .eq("whatsapp_channel_id", whatsappChannelId)
    .eq("contact_e164", contactE164);

  const options = data.options as Record<string, string>;
  const trimmed = body.trim();
  return options[trimmed] ?? body;
}
