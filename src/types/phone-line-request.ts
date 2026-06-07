export type PhoneLineRequestType = "purchase_line" | "verify_outbound";
export type PhoneLineRequestStatus = "pending" | "in_progress" | "completed" | "rejected";

export interface PhoneLineRequestRecord {
  id: string;
  user_id: string;
  voice_agent_id: string | null;
  request_type: PhoneLineRequestType;
  phone_e164: string | null;
  country_code: string | null;
  notes: string | null;
  status: PhoneLineRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface PhoneLineRequestAdminRow extends PhoneLineRequestRecord {
  client_name: string | null;
  client_email: string | null;
  agent_name: string | null;
}
