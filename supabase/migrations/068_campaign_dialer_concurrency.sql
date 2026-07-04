-- Concurrencia atómica del marcador de campañas (evita ticks paralelos y doble marcado).

insert into public.platform_settings (key, value, updated_at)
values (
  'call_engine_dialer_state',
  jsonb_build_object('locked_until', null, 'last_tick_at', null),
  now()
)
on conflict (key) do nothing;

create or replace function public.try_acquire_campaign_dialer_tick(
  p_force boolean,
  p_min_gap_seconds integer,
  p_debounce_seconds integer default 15,
  p_lock_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_state jsonb;
  v_locked_until timestamptz;
  v_last_tick timestamptz;
begin
  insert into public.platform_settings (key, value, updated_at)
  values (
    'call_engine_dialer_state',
    jsonb_build_object('locked_until', null, 'last_tick_at', null),
    v_now
  )
  on conflict (key) do nothing;

  select value into v_state
  from public.platform_settings
  where key = 'call_engine_dialer_state'
  for update;

  v_locked_until := nullif(v_state->>'locked_until', '')::timestamptz;
  v_last_tick := nullif(v_state->>'last_tick_at', '')::timestamptz;

  if v_locked_until is not null and v_locked_until > v_now then
    return false;
  end if;

  if p_force then
    if v_last_tick is not null and v_last_tick > v_now - make_interval(secs => p_debounce_seconds) then
      return false;
    end if;
  else
    if v_last_tick is not null and v_last_tick > v_now - make_interval(secs => p_min_gap_seconds) then
      return false;
    end if;
  end if;

  update public.platform_settings
  set
    value = jsonb_build_object(
      'locked_until', (v_now + make_interval(secs => p_lock_seconds))::text,
      'last_tick_at', v_now::text
    ),
    updated_at = v_now
  where key = 'call_engine_dialer_state';

  return true;
end;
$$;

create or replace function public.release_campaign_dialer_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_settings
  set
    value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
      'locked_until', (now() - interval '1 second')::text
    ),
    updated_at = now()
  where key = 'call_engine_dialer_state';
end;
$$;

create or replace function public.count_campaign_dialer_active_slots(
  p_calling_grace_minutes integer default 15
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select count(*)::int
      from public.voice_agent_calls
      where status = 'in_progress'
        and campaign_id is not null
    ), 0)
    + coalesce((
      select count(*)::int
      from public.campaign_audience_rows r
      where r.call_status = 'calling'
        and r.last_attempt_at > now() - make_interval(mins => p_calling_grace_minutes)
        and not exists (
          select 1
          from public.voice_agent_calls vc
          where vc.campaign_audience_row_id = r.id
            and vc.status = 'in_progress'
        )
    ), 0);
$$;

grant execute on function public.try_acquire_campaign_dialer_tick(boolean, integer, integer, integer) to service_role;
grant execute on function public.release_campaign_dialer_tick() to service_role;
grant execute on function public.count_campaign_dialer_active_slots(integer) to service_role;
