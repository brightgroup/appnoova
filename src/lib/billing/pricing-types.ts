export type UsageEventType =
  | "ori"
  | "milink"
  | "widget"
  | "text_test"
  | "whatsapp_ai"
  | "whatsapp_manual"
  | "voice"
  | "voice_premium"
  | "voice_voicemail"
  | "voice_no_answer"
  | "doc_scan"
  | "form_fill"
  | "quote";

export type VoiceBillingProvider = "google" | "elevenlabs";
