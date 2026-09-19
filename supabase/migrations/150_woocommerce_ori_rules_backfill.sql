-- La columna organizations.woocommerce_ori_rules quedó fuera de la primera
-- corrida de 148_woocommerce.sql: esa migración ya se había marcado como
-- aplicada (schema_migrations) antes de que se agregara este bloque al
-- archivo, así que las corridas posteriores del script la saltaron sin
-- volver a ejecutar el contenido nuevo. Se separa en su propio archivo para
-- no depender de re-correr 148 completo (que ya no es idempotente de punta a
-- punta: create policy no soporta IF NOT EXISTS y falla si la política ya existe).

alter table public.organizations
  add column if not exists woocommerce_ori_rules jsonb not null default
    '{"enabled": false, "canReadProducts": false, "canReadOrders": false, "canWriteProducts": false, "canWriteOrders": false}'::jsonb;
