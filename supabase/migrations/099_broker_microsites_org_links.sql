-- Mi Link: de "uno por usuario" a "hasta N por organización" según el plan.
-- Crecimiento = 5, Escala = 10, resto (Explorador/Esencial/Básico) se mantiene en 1.

alter table public.plans add column if not exists max_links int;
comment on column public.plans.max_links is 'Máximo de Mi Links por organización; NULL = ilimitado';

update public.plans set max_links = 1  where id = 'explorador';
update public.plans set max_links = 1  where id = 'esencial';
update public.plans set max_links = 1  where id = 'basico';
update public.plans set max_links = 5  where id = 'crecimiento';
update public.plans set max_links = 10 where id = 'escala';

-- broker_microsites pasa a ser un recurso de organización (compartido por el equipo)
alter table public.broker_microsites
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill: misma cascada de resolución que resolveOrgIdForUser (src/lib/billing/meter.ts)
-- pasada 1: organización activa del usuario
update public.broker_microsites m
set organization_id = uao.organization_id
from public.user_active_organization uao
where m.user_id = uao.user_id
  and m.organization_id is null;

-- pasada 2: organización propia (dueño)
update public.broker_microsites m
set organization_id = o.id
from public.organizations o
where o.owner_user_id = m.user_id
  and o.status = 'active'
  and m.organization_id is null;

-- pasada 3: primera membresía activa
update public.broker_microsites m
set organization_id = om.organization_id
from (
  select distinct on (user_id) user_id, organization_id
  from public.organization_members
  where status = 'active'
  order by user_id, joined_at
) om
where om.user_id = m.user_id
  and m.organization_id is null;

-- Verificación manual post-backfill (correr y revisar antes de confiar en queries org-scoped):
--   select id, user_id from public.broker_microsites where organization_id is null;

-- Quitar el límite duro de "uno por usuario"; el límite ahora lo aplica la app
-- según assertOrgHasAvailableLink() (src/lib/org-links.ts), leyendo plans.max_links.
alter table public.broker_microsites drop constraint if exists broker_microsites_user_id_key;

create index if not exists broker_microsites_user_idx on public.broker_microsites (user_id);
create index if not exists broker_microsites_org_idx  on public.broker_microsites (organization_id);

-- RLS: broker_microsites es ahora un recurso compartido de organización (a diferencia
-- de text_agents, que sigue conceptualmente ligado a su creador aunque sea visible por
-- toda la org). Cualquier miembro activo de la organización puede gestionar los Mi Links
-- de su org; se conserva auth.uid() = user_id como fallback para filas legacy sin
-- organization_id (no debería quedar ninguna tras el backfill, pero es defensa en
-- profundidad). El acceso real de la app pasa por un cliente service-role y filtra por
-- organization_id en el código (igual que text_agents), así que esto es defensa en
-- profundidad adicional, no el mecanismo de enforcement.
drop policy if exists "broker_microsites_select_own" on public.broker_microsites;
drop policy if exists "broker_microsites_insert_own" on public.broker_microsites;
drop policy if exists "broker_microsites_update_own" on public.broker_microsites;
drop policy if exists "broker_microsites_delete_own" on public.broker_microsites;

create policy "broker_microsites_select_org" on public.broker_microsites
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = broker_microsites.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create policy "broker_microsites_insert_org" on public.broker_microsites
  for insert with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = broker_microsites.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create policy "broker_microsites_update_org" on public.broker_microsites
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = broker_microsites.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

create policy "broker_microsites_delete_org" on public.broker_microsites
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = broker_microsites.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );
