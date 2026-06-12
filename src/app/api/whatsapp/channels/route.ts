import { NextRequest, NextResponse } from "next/server";
import { isMissingTableError } from "@/lib/supabase-table-error";
import { toWhatsAppChannelRecord } from "@/lib/whatsapp-channel";
import { twilioWhatsAppWebhookUrl } from "@/lib/telephony/app-url";
import { isTwilioWhatsAppConfigured } from "@/lib/whatsapp/twilio-whatsapp";
import { textAgentsAdminClient, getTextAgentUserIdFromRequest } from "@/lib/text-agents-server";

export async function GET(req: NextRequest) {
  const userId = await getTextAgentUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const db = textAgentsAdminClient();
  const { data, error } = await db
    .from("whatsapp_channels")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({
        channels: [],
        dbReady: false,
        webhook_url: twilioWhatsAppWebhookUrl(),
        twilio_configured: isTwilioWhatsAppConfigured()
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    channels: (data ?? []).map(row => toWhatsAppChannelRecord(row)),
    dbReady: true,
    webhook_url: twilioWhatsAppWebhookUrl(),
    twilio_configured: isTwilioWhatsAppConfigured()
  });
}
