-- Plantillas WhatsApp: creación desde Noova, envío a proveedor (Twilio → Meta)

alter table public.whatsapp_templates
  alter column twilio_content_sid drop not null;

alter table public.whatsapp_templates
  add column if not exists provider text not null default 'twilio',
  add column if not exists body_source text,
  add column if not exists variable_examples jsonb not null default '[]'::jsonb,
  add column if not exists rejection_reason text;

-- Migrar estados legacy
update public.whatsapp_templates set status = 'approved' where status = 'active';

drop index if exists whatsapp_templates_channel_sid_idx;

create unique index if not exists whatsapp_templates_channel_sid_idx
  on public.whatsapp_templates (whatsapp_channel_id, twilio_content_sid)
  where twilio_content_sid is not null;

create unique index if not exists whatsapp_templates_channel_name_idx
  on public.whatsapp_templates (whatsapp_channel_id, template_name);

create index if not exists whatsapp_templates_pending_idx
  on public.whatsapp_templates (status, updated_at)
  where status = 'pending_approval';
