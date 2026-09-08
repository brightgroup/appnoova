-- Recarga automática de créditos (modelo Claude/ElevenLabs/Twilio): cuando el
-- saldo baja de un umbral, se cobra automáticamente un paquete de créditos a
-- la tarjeta ya guardada en Paddle. La controla el propio cliente desde su
-- panel; admin_enabled es el interruptor general del superadmin por cuenta.

create table if not exists public.organization_autorecharge (
  organization_id   uuid primary key references public.organizations(id) on delete cascade,
  enabled            boolean not null default false,
  admin_enabled      boolean not null default true,
  threshold_credits  bigint not null default 5000,
  package_credits    bigint not null default 50000,
  monthly_cap_usd    numeric not null default 100,
  spent_this_cycle_usd numeric not null default 0,
  cap_cycle_start    timestamptz not null default now(),
  last_recharge_at   timestamptz,
  in_flight          boolean not null default false,
  consent_at         timestamptz,
  updated_at         timestamptz not null default now()
);

-- Registra el consumo del mes en curso y evita cobros en ráfaga:
-- máximo una recarga activa a la vez (in_flight) y respeta el tope mensual.
create or replace function public.billing_autorecharge_reserve(p_org uuid, p_package_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.organization_autorecharge%rowtype;
begin
  select * into a from public.organization_autorecharge where organization_id = p_org for update;
  if not found or not a.enabled or not a.admin_enabled then
    return jsonb_build_object('allowed', false, 'reason', 'disabled');
  end if;
  if a.in_flight then
    return jsonb_build_object('allowed', false, 'reason', 'in_flight');
  end if;

  -- Reinicia el contador del tope mensual cada 30 días desde el último reinicio.
  if a.cap_cycle_start + interval '30 days' <= now() then
    update public.organization_autorecharge
      set spent_this_cycle_usd = 0, cap_cycle_start = now()
      where organization_id = p_org;
    a.spent_this_cycle_usd := 0;
  end if;

  if a.spent_this_cycle_usd + p_package_usd > a.monthly_cap_usd then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_cap');
  end if;

  update public.organization_autorecharge
    set in_flight = true, updated_at = now()
    where organization_id = p_org;

  return jsonb_build_object('allowed', true);
end;
$$;

-- Libera la reserva tras el intento de cobro (éxito o fracaso) y, si fue
-- exitoso, suma los créditos y registra el gasto del ciclo.
create or replace function public.billing_autorecharge_settle(
  p_org uuid,
  p_success boolean,
  p_credits bigint default 0,
  p_amount_usd numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_success then
    update public.organization_credit_wallets
      set topup_credits = greatest(0, coalesce(topup_credits, 0) + p_credits),
          updated_at = now()
      where organization_id = p_org;

    update public.organization_autorecharge
      set in_flight = false,
          last_recharge_at = now(),
          spent_this_cycle_usd = spent_this_cycle_usd + p_amount_usd,
          updated_at = now()
      where organization_id = p_org;
  else
    update public.organization_autorecharge
      set in_flight = false, updated_at = now()
      where organization_id = p_org;
  end if;
end;
$$;
