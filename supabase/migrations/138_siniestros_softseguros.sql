-- Ampliar Softseguros más allá de pólizas: también siniestros (sync en bloque, ver plan
-- "Ampliar Softseguros" 2026-09-09). metadata guarda softseguros_id para poder hacer upsert sin
-- duplicar en cada resync — mismo criterio que polizas.metadata (112_polizas.sql).

alter table public.siniestros
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.siniestros
  drop constraint if exists siniestros_source_check;
alter table public.siniestros
  add constraint siniestros_source_check check (source in ('whatsapp', 'web', 'ori', 'manual', 'softseguros'));

comment on column public.siniestros.metadata is
  'Datos de origen externo — hoy solo softseguros_id, para deduplicar en resyncs (ver upsertSiniestroDesdeSoftseguros).';
