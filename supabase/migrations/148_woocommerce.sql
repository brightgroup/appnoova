-- Conector WooCommerce por organización — igual espíritu que hubspot_connections
-- (100) / softseguros_connections (117): credenciales cifradas a nivel de
-- aplicación, una fila por organización. A diferencia de esos dos, WooCommerce
-- no tiene un host fijo (cada cliente tiene su propio dominio WordPress), así
-- que site_url viaja en texto plano junto a las credenciales cifradas.
--
-- Decisión explícita del usuario (2026-09-17): NO se sincroniza un catálogo
-- local de productos/pedidos — los agentes consultan y actualizan WooCommerce
-- en vivo en cada turno. Estas tablas son solo la conexión y el dedup de
-- webhooks para alimentar el editor de Automations en tiempo real.

create table if not exists public.woocommerce_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  site_url              text not null,
  -- JSON cifrado: {"consumer_key": "...", "consumer_secret": "..."}
  credentials_enc       text not null,
  -- Secreto usado para verificar la firma HMAC de los webhooks entrantes de esta tienda.
  webhook_secret_enc    text,
  -- Ids que devuelve WooCommerce al registrar los webhooks (para poder borrarlos al desconectar).
  order_webhook_id      integer,
  product_webhook_id    integer,
  status                text not null default 'pending' check (status in ('pending', 'active', 'disconnected', 'error')),
  last_error            text,
  connected_by_user_id  uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint woocommerce_connections_org_unique unique (organization_id)
);

create index if not exists woocommerce_connections_org_idx
  on public.woocommerce_connections (organization_id);

comment on table public.woocommerce_connections is
  'Conexión WooCommerce por organización (Consumer Key/Secret de la tienda propia del cliente). Sin catálogo espejo: los agentes consultan la API en vivo.';

alter table public.woocommerce_connections enable row level security;

create policy woocommerce_connections_member_select on public.woocommerce_connections
  for select to authenticated
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1 from public.organization_members om
      where om.organization_id = woocommerce_connections.organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    )
  );

-- Dedup de webhooks entrantes de WooCommerce (mismo patrón que
-- hubspot_processed_messages, 100_hubspot_connector.sql) — WooCommerce puede
-- reintentar una entrega que no respondió a tiempo.
create table if not exists public.woocommerce_processed_webhooks (
  delivery_id      text primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  topic            text not null,
  created_at       timestamptz not null default now()
);

create index if not exists woocommerce_processed_webhooks_created_idx
  on public.woocommerce_processed_webhooks (created_at);

comment on table public.woocommerce_processed_webhooks is
  'Dedup de webhooks de WooCommerce (product.updated/order.created/order.updated) ya procesados, por delivery_id.';

alter table public.woocommerce_processed_webhooks enable row level security;

-- Permisos de lectura/escritura de WooCommerce POR AGENTE — mismo patrón que
-- quoting_rules (114_agent_quoting_rules.sql): que la organización tenga la
-- tienda conectada no alcanza, cada agente necesita su propio interruptor
-- explícito, y el cliente decide si su IA solo consulta o también actualiza
-- productos/pedidos. Todo apagado por defecto.
alter table public.text_agents
  add column if not exists woocommerce_rules jsonb not null default
    '{"enabled": false, "canReadProducts": false, "canReadOrders": false, "canWriteProducts": false, "canWriteOrders": false}'::jsonb;

alter table public.voice_agents
  add column if not exists woocommerce_rules jsonb not null default
    '{"enabled": false, "canReadProducts": false, "canReadOrders": false, "canWriteProducts": false, "canWriteOrders": false}'::jsonb;

-- Mismo interruptor, a nivel de organización, para Ori (copiloto interno) —
-- Ori no es una fila en text_agents/voice_agents, así que su permiso vive en
-- la organización. Se edita desde el propio conector (/dashboard/conectores/woocommerce),
-- no desde una página de configuración de Ori que hoy no tiene este patrón de interruptores.
alter table public.organizations
  add column if not exists woocommerce_ori_rules jsonb not null default
    '{"enabled": false, "canReadProducts": false, "canReadOrders": false, "canWriteProducts": false, "canWriteOrders": false}'::jsonb;
