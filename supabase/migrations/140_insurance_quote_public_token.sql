-- Link público de cotización estilo Figuro (2026-09-10) — el token se
-- genera BAJO DEMANDA desde la app (POST .../share-link), nunca por default
-- de columna, para no repartir un link válido de una fila que todavía está
-- "pendiente" sin precio real. Mismo patrón de token que
-- external_quote_sources.inbound_token (115): el token ES la autenticación,
-- sin filtro adicional por organización en la lectura pública.
alter table public.insurance_quote_requests
  add column if not exists public_token text unique;
