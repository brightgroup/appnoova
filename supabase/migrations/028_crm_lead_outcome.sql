-- Ganado / Perdido son resultados del lead, no etapas del pipeline

alter table public.crm_leads
  add column if not exists outcome text not null default 'open'
  check (outcome in ('open', 'won', 'lost'));

-- Migrar leads que estaban en etapas marcadas como ganado/perdido
update public.crm_leads l
set outcome = case
  when s.is_won then 'won'
  when s.is_lost then 'lost'
  else l.outcome
end
from public.crm_pipeline_stages s
where l.stage_id = s.id and (s.is_won or s.is_lost);

-- Reasignar etapa al último paso activo del pipeline
update public.crm_leads l
set stage_id = sub.fallback_stage
from (
  select
    l2.id as lead_id,
    (
      select s2.id
      from public.crm_pipeline_stages s2
      where s2.user_id = l2.user_id
        and not s2.is_won
        and not s2.is_lost
      order by s2.sort_order desc
      limit 1
    ) as fallback_stage
  from public.crm_leads l2
  join public.crm_pipeline_stages s on s.id = l2.stage_id
  where s.is_won or s.is_lost
) sub
where l.id = sub.lead_id and sub.fallback_stage is not null;

delete from public.crm_pipeline_stages where is_won or is_lost;

create index if not exists crm_leads_user_outcome_idx
  on public.crm_leads (user_id, outcome);
