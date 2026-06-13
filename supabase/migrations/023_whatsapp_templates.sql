-- Plantillas WhatsApp (Meta Utility) — registro manual PMV (ContentSid HX...)
create table if not exists public.whatsapp_templates (
  id                    uuid primary key default gen_random_uuid(),
  whatsapp_channel_id   uuid not null references public.whatsapp_channels(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  twilio_content_sid    text not null,
  template_name         text not null,
  category              text not null default 'utility',
  language              text not null default 'es',
  body_preview          text not null,
  variable_labels       jsonb not null default '[]'::jsonb,
  status                text not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists whatsapp_templates_channel_sid_idx
  on public.whatsapp_templates (whatsapp_channel_id, twilio_content_sid);

create index if not exists whatsapp_templates_channel_idx
  on public.whatsapp_templates (whatsapp_channel_id, status);

alter table public.whatsapp_templates enable row level security;

drop policy if exists "whatsapp_templates_select_own" on public.whatsapp_templates;
create policy "whatsapp_templates_select_own" on public.whatsapp_templates
  for select using (auth.uid() = user_id);
