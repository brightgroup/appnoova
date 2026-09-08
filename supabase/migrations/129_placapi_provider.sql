-- PlacApi como segundo proveedor de datos vehiculares (evaluado 2026-09-08:
-- mismo dato de Fasecolda que Verifik, + SOAT/RTM/SIMIT, a 5-15x menos costo
-- por consulta). Se agrega como conector opcional más (mismo patrón de
-- bóveda que La Equidad/Verifik) — cuál es el proveedor COMPARTIDO por
-- defecto de Noova se decide en platform_settings (ver
-- src/lib/insurers/vehicle-data-provider.ts), no en esta tabla.
alter table public.insurer_connections drop constraint if exists insurer_connections_provider_key_check;
alter table public.insurer_connections
  add constraint insurer_connections_provider_key_check check (provider_key in ('la_equidad', 'verifik', 'placapi'));
