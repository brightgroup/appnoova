-- Marca de tiempo cuando una campaña finaliza automáticamente o manualmente.

alter table public.voice_campaigns
  add column if not exists completed_at timestamptz;

create index if not exists voice_campaigns_completed_at_idx
  on public.voice_campaigns (organization_id, completed_at desc)
  where status = 'completed';
