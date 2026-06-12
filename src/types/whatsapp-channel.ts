export type WhatsAppChannelStatus = "pending" | "active" | "suspended";

export interface WhatsAppChannelRecord {
  id: string;
  user_id: string;
  text_agent_id: string | null;
  provider: string;
  e164: string;
  twilio_messaging_service_sid: string | null;
  friendly_name: string | null;
  waba_id: string | null;
  status: WhatsAppChannelStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppChannelFormData {
  text_agent_id: string | null;
  friendly_name: string | null;
}
