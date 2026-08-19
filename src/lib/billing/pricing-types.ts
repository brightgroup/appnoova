export type UsageEventType =
  | "ori"
  | "milink"
  | "widget"
  | "text_test"
  | "whatsapp_ai"
  | "whatsapp_manual"
  | "whatsapp_media_ai"
  | "automation_extract"
  | "voice"
  | "voice_premium"
  | "voice_voicemail"
  | "voice_no_answer"
  | "doc_scan"
  | "form_fill"
  | "quote";

export type VoiceBillingProvider = "google" | "elevenlabs";
