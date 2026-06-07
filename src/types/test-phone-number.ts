export interface TestPhoneNumberRecord {
  id: string;
  user_id: string;
  label: string;
  e164: string;
  active: boolean;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}
