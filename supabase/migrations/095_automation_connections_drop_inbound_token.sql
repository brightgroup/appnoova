-- Separa limpiamente entrada y salida en automatizaciones: los conectores
-- (automation_connections) pasan a ser solo el lado de salida (a dónde manda
-- Noova el evento). El lado de entrada (que un sistema externo le responda a
-- Noova) vive exclusivamente en los nodos "Webhook entrante" de cada
-- workflow (tabla workflow_webhook_triggers, ver migración 087) — cada
-- conector ya no tiene su propio callback implícito.

alter table public.automation_connections
  drop column if exists inbound_token;

comment on table public.automation_connections is
  'Conector de webhook saliente por organización (n8n y similares) — solo envía, no recibe. Secreto cifrado a nivel de aplicación.';
