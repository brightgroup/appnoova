-- Paquetes custom: no públicos en landing; solo visibles en panel asignado.

alter table public.plans
  add column if not exists is_public boolean not null default false;

update public.plans
  set is_public = true
  where is_system = true;

update public.plans
  set is_public = false
  where is_system = false;
