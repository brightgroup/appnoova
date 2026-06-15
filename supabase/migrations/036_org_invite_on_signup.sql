-- Aceptar invitaciones de organización al crear perfil (registro nuevo)

create or replace function public.accept_organization_invites_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  for inv in
    select oi.id, oi.organization_id, oi.role_id, oi.invited_by
    from public.organization_invites oi
    where lower(trim(oi.email)) = lower(trim(new.email))
      and oi.accepted_at is null
      and oi.expires_at > now()
  loop
    insert into public.organization_members (
      organization_id, user_id, role_id, status, invited_by, invited_at
    )
    values (
      inv.organization_id, new.id, inv.role_id, 'active', inv.invited_by, now()
    )
    on conflict (organization_id, user_id) do nothing;

    update public.organization_invites
    set accepted_at = now()
    where id = inv.id;

    insert into public.user_active_organization (user_id, organization_id, updated_at)
    values (new.id, inv.organization_id, now())
    on conflict (user_id) do update set
      organization_id = excluded.organization_id,
      updated_at = now();
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_accept_org_invites on public.profiles;
create trigger profiles_accept_org_invites
  after insert on public.profiles
  for each row
  execute function public.accept_organization_invites_for_profile();

-- FK explícita para joins PostgREST (organization_members → profiles)
do $$ begin
  alter table public.organization_members
    add constraint organization_members_profile_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;
