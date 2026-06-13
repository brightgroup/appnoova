export type WhatsAppTemplateCategory = "utility" | "marketing" | "authentication";

/** draft → pending_approval → approved | rejected */
export type WhatsAppTemplateStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "inactive";

export type WhatsAppTemplateProvider = "twilio" | "dialog360";

export interface WhatsAppTemplateRecord {
  id: string;
  whatsapp_channel_id: string;
  user_id: string;
  provider: WhatsAppTemplateProvider;
  twilio_content_sid: string | null;
  template_name: string;
  category: WhatsAppTemplateCategory;
  language: string;
  /** Cuerpo en formato Twilio {{1}}, {{2}}… */
  body_preview: string;
  /** Cuerpo original con {{nombre_variable}} (solo UI) */
  body_source: string | null;
  variable_labels: string[];
  variable_examples: string[];
  status: WhatsAppTemplateStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplateFormData {
  whatsapp_channel_id: string;
  template_name: string;
  category: WhatsAppTemplateCategory;
  language: string;
  body_source: string;
  variable_examples: string[];
}
