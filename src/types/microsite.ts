export interface MicrositeQuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  enabled: boolean;
}

export interface BrokerMicrositeFormData {
  slug: string;
  company_context_id: string | null;
  text_agent_id: string | null;
  accent_color: string;
  button_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  agent_display_name: string | null;
  quick_actions: MicrositeQuickAction[];
  is_published: boolean;
}

export interface BrokerMicrositeRecord extends BrokerMicrositeFormData {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/** Config del widget web (independiente de Mi Link) */
export interface BrokerWebWidgetFormData {
  text_agent_id: string | null;
  accent_color: string;
  button_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  agent_display_name: string | null;
  quick_actions: MicrositeQuickAction[];
  is_published: boolean;
}

export interface BrokerWebWidgetRecord extends BrokerWebWidgetFormData {
  id: string;
  user_id: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

/** Config pública consumida por la plantilla /agenteclientes */
export interface PublicMicrositeConfig {
  slug: string;
  name: string;
  agentName: string;
  initials: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  accent: string;
  buttonColor: string;
  quickActions: MicrositeQuickAction[];
  chatEndpoint: string;
}
