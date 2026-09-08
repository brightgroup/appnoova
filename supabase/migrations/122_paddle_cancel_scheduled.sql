-- Fecha en que una suscripción de Paddle dejará de renovarse (cancelación
-- programada a fin de periodo). null = sin cancelación programada.
alter table public.organization_subscriptions
  add column if not exists paddle_cancel_scheduled_at timestamptz;
