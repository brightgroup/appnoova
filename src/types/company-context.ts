export interface CompanyContext {
  id: string;
  user_id: string;
  name: string;
  content: string;
  website_url: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyContextFormData {
  name: string;
  content: string;
  website_url: string;
  is_default: boolean;
}
