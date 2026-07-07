-- No contar llamadas ya finalizadas en metadata como cupo activo del marcador.

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
        and coalesce((metadata->>'finalized')::boolean, false) = false
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
            and coalesce((vc.metadata->>'finalized')::boolean, false) = false
        )
    ), 0);
$$;
