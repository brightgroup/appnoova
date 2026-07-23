-- Modo alternativo de conexión de calendario: "hosted". En vez de que el
-- cliente conecte su propia cuenta de Google (OAuth, sujeto al vencimiento
-- de 7 días mientras el conector siga en modo Prueba de Google), Noova crea
-- el calendario vía una cuenta de servicio con delegación de dominio de
-- Workspace y lo comparte con el correo del cliente. No requiere tokens
-- OAuth propios, así que access_token_enc/refresh_token_enc pasan a ser
-- opcionales.

alter table public.calendar_connections
  add column if not exists connection_mode text not null default 'oauth'
    check (connection_mode in ('oauth', 'hosted')),
  add column if not exists shared_with_email text;

alter table public.calendar_connections
  alter column access_token_enc drop not null,
  alter column refresh_token_enc drop not null;

comment on column public.calendar_connections.connection_mode is
  '''oauth'': el cliente conectó su propia cuenta de Google. ''hosted'': Noova creó el calendario vía cuenta de servicio con delegación de dominio y lo comparte con shared_with_email.';

comment on column public.calendar_connections.shared_with_email is
  'Solo en modo hosted: correo del cliente al que se compartió el calendario creado por Noova.';
