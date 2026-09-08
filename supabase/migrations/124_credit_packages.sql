-- Paquetes de recarga de créditos (compra puntual, no un plan de suscripción).
-- Precio a la tarifa de referencia 1 crédito = USD 0.0003 (billing_unit_prices).
-- paddle_price_id_* quedan null hasta crear los precios one-time en Paddle
-- (billing_cycle: null) — sin eso, la recarga automática no puede cobrar.

create table if not exists public.credit_packages (
  id                  text primary key,
  credits             bigint not null,
  price_usd           numeric not null,
  sort_order          int not null default 0,
  is_active           boolean not null default true,
  paddle_price_id_sandbox text,
  paddle_price_id_live    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

insert into public.credit_packages (id, credits, price_usd, sort_order) values
  ('topup_15k',  15000,  4.5,  10),
  ('topup_50k',  50000,  15,   20),
  ('topup_100k', 100000, 30,  30),
  ('topup_350k', 350000, 105,  40)
on conflict (id) do update set
  credits = excluded.credits,
  price_usd = excluded.price_usd,
  sort_order = excluded.sort_order;
