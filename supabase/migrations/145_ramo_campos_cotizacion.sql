-- Campos de cotización configurables + botones deterministas por WhatsApp (ver
-- docs/HANDOFF-CAMPOS-COTIZACION-CONFIGURABLES.md). Extiende poliza_ramo_campos
-- (137_poliza_ramo_campos.sql) con lo que necesita el flujo de cotización de la
-- IA: qué pregunta hacer, cómo presentarla (botones/lista/texto) y si es
-- obligatoria para cotizar — sin esto la tabla solo servía para el checklist
-- informativo del asesor (label/tipo/opciones), no para pilotar la conversación.
alter table public.poliza_ramo_campos
  add column if not exists pregunta              text,
  add column if not exists ayuda                 text,
  add column if not exists presentacion          text not null default 'auto'
    check (presentacion in ('auto', 'botones', 'lista', 'texto')),
  add column if not exists aplica_cotizacion     boolean not null default true,
  add column if not exists requerido_cotizacion  boolean not null default true;

comment on column public.poliza_ramo_campos.pregunta is
  'Texto que la IA le dice al cliente para pedir este dato — si es null, se usa label.';
comment on column public.poliza_ramo_campos.ayuda is
  'Explicación corta que la IA da si el cliente pregunta qué significa el campo (ej. "importación directa").';
comment on column public.poliza_ramo_campos.presentacion is
  '"auto" deja que el código decida (2-3 opciones = botones, 4-10 = lista, >10/sin opciones = texto); las otras tres fuerzan esa forma.';
comment on column public.poliza_ramo_campos.aplica_cotizacion is
  'false = campo informativo para el asesor (ej. metadata de la póliza) que la IA no pregunta durante la cotización.';
comment on column public.poliza_ramo_campos.requerido_cotizacion is
  'false = la IA no bloquea la cotización esperando este dato (queda opcional).';

-- Motos no existe hoy en el catálogo de ramos (134_ramos_catalogo.sql) — falta
-- para poder tener campos de cotización propios (autos/motos comparten forma
-- pero son ramos distintos del catálogo real).
insert into public.ramos_catalogo (nombre, slug)
values ('MOTOS', 'motos')
on conflict (slug) do nothing;
