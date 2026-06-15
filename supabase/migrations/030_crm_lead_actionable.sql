-- Lead accionable: próxima acción, asignación, score y tiempos de etapa

alter table public.crm_leads
  add column if not exists proxima_accion text,
  add column if not exists proxima_accion_fecha timestamptz,
  add column if not exists proxima_accion_tipo text
    check (proxima_accion_tipo is null or proxima_accion_tipo in (
      'whatsapp', 'llamada', 'email', 'cotizacion_ori', 'tarea_asesor', 'esperar'
    )),
  add column if not exists proxima_accion_estado text not null default 'pendiente'
    check (proxima_accion_estado in ('pendiente', 'hecha', 'vencida', 'cancelada')),
  add column if not exists motivo_perdida text
    check (motivo_perdida is null or motivo_perdida in (
      'precio', 'no_respondio', 'compro_otro', 'no_era_momento',
      'sin_presupuesto', 'datos_incompletos', 'otro'
    )),
  add column if not exists motivo_perdida_detalle text,
  add column if not exists asesor_responsable text,
  add column if not exists categoria_interes text,
  add column if not exists producto_interes text,
  add column if not exists score int
    check (score is null or (score >= 0 and score <= 100)),
  add column if not exists temperatura text
    check (temperatura is null or temperatura in ('frio', 'tibio', 'caliente')),
  add column if not exists stage_entered_at timestamptz not null default now(),
  add column if not exists fecha_ultima_interaccion timestamptz,
  add column if not exists field_provenance jsonb not null default '{}'::jsonb,
  add column if not exists inbox_conversation_id uuid;

update public.crm_leads
set stage_entered_at = coalesce(stage_entered_at, updated_at, created_at)
where stage_entered_at is null;

update public.crm_leads
set producto_interes = nullif(trim(metadata->>'producto'), '')
where producto_interes is null
  and nullif(trim(metadata->>'producto'), '') is not null;

update public.crm_leads
set proxima_accion = 'Dar seguimiento',
    proxima_accion_fecha = coalesce(created_at, now()) + interval '1 day',
    proxima_accion_estado = 'pendiente'
where outcome = 'open'
  and (proxima_accion is null or proxima_accion_fecha is null);

create index if not exists crm_leads_user_proxima_idx
  on public.crm_leads (user_id, proxima_accion_fecha)
  where outcome = 'open';

create index if not exists crm_leads_user_asesor_idx
  on public.crm_leads (user_id, asesor_responsable)
  where outcome = 'open';
