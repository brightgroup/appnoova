-- Fase 3 del rediseño de pólizas: vincular polizas.ramo (texto libre, ya existente) al catálogo
-- estándar de la industria (130_ramos_catalogo.sql). Nullable a propósito — no rompe pólizas ya
-- cargadas con solo texto libre, y sigue permitiendo un ramo no catalogado ("Otro: ...").

alter table public.polizas
  add column if not exists ramo_id uuid references public.ramos_catalogo(id) on delete set null;

create index if not exists polizas_ramo_id_idx on public.polizas (ramo_id);

comment on column public.polizas.ramo_id is
  'Referencia al ramo estándar de industria (ramos_catalogo) — polizas.ramo sigue siendo el texto mostrado/editable, igual que Softseguros mantiene ramo_nombre denormalizado.';
