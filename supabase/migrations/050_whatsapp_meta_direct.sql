-- WhatsApp Cloud API directo (Meta Graph) — alternativa a Twilio por canal
alter table public.whatsapp_channels
  add column if not exists meta_access_token text;

comment on column public.whatsapp_channels.meta_access_token is
  'Token de acceso Meta (system user) para enviar/recibir vía Cloud API — solo servidor';
