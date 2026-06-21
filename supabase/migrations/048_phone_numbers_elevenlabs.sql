-- Vinculación automática de líneas Telnyx con ElevenLabs (voz premium)
alter table public.phone_numbers
  add column if not exists elevenlabs_phone_number_id text,
  add column if not exists elevenlabs_sync_error text,
  add column if not exists elevenlabs_synced_at timestamptz;

comment on column public.phone_numbers.elevenlabs_phone_number_id is
  'ID remoto en ElevenLabs ConvAI (import SIP trunk)';
comment on column public.phone_numbers.elevenlabs_sync_error is
  'Último error al sincronizar con ElevenLabs; null = OK';
comment on column public.phone_numbers.elevenlabs_synced_at is
  'Última sincronización exitosa con ElevenLabs';

create index if not exists phone_numbers_elevenlabs_id_idx
  on public.phone_numbers (elevenlabs_phone_number_id)
  where elevenlabs_phone_number_id is not null;
