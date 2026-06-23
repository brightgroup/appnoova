-- Campos para vinculación self-serve (Meta Embedded Signup + Twilio Senders API)
alter table public.whatsapp_channels
  add column if not exists meta_phone_number_id text,
  add column if not exists twilio_sender_sid text;

comment on column public.whatsapp_channels.meta_phone_number_id is
  'ID del número en Meta Graph API tras Embedded Signup';
comment on column public.whatsapp_channels.twilio_sender_sid is
  'SID del WhatsApp Sender en Twilio (XE…)';
