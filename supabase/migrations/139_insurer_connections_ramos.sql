-- Qué ramos cotiza cada aseguradora conectada (2026-09-10, pedido del
-- usuario: "que la aseguradora escogiera los ramos que maneja, igual a
-- Figuro"). Array libre de slugs de ramos_catalogo (134) — no lleva CHECK
-- porque ese catálogo tiene 93 valores y crece; se valida en la ruta, no en
-- la base. Con esto, quote-guidance.ts deja de asumir "La Equidad = autos" a
-- secas y puede ofrecer cotización automática para cualquier ramo que la
-- org marque como soportado por una aseguradora activa.
alter table public.insurer_connections
  add column if not exists ramos text[] not null default '{}'::text[];
