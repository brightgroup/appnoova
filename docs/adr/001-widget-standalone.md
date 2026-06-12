# ADR 001: Widget web independiente de Mi Link

**Estado:** Aceptado  
**Fecha:** 2025-06  
**Contexto:** Canales de atención — Widget web vs Mi Link

## Contexto

El widget embebible y la página Mi Link (`/c/{slug}`) son productos distintos para el corredor:

- Mi Link: página de chat dedicada, compartible como URL.
- Widget: botón flotante embebido en sitios de terceros vía `noova-widget.js`.

La implementación inicial creó `broker_web_widgets` con `microsite_id` FK a `broker_microsites`. Eso implicaba:

- No se podía tener widget sin micrositio.
- Configuración acoplada (mismo dueño vía join).
- Confusión de producto (“el widget cuelga del micrositio”).

## Decisión

Separar completamente ambos canales:

| | Mi Link | Widget |
|---|---------|--------|
| Tabla | `broker_microsites` | `broker_web_widgets` |
| Dueño | `user_id` | `user_id` |
| Slug | propio | propio |
| URL | `/c/{slug}` | `/widget/{slug}` |
| Canal inbox | `web_widget` | `web_embed` |
| API | `/api/microsite` | `/api/widget` |

No hay FK entre tablas. Los slugs pueden coincidir (namespaces distintos).

Migración: `020_widget_standalone.sql` — añade `user_id`/`slug`, migra datos desde micrositio si existían, elimina `microsite_id`.

## Consecuencias

**Positivas**

- Cliente puede activar solo widget, solo Mi Link, ambos o ninguno.
- Equipos pueden evolucionar cada canal sin migraciones cruzadas.
- Onboarding en dashboard: flujos `canales/mi-link` y `canales/widget` separados.

**Negativas**

- Duplicación de campos de branding (colores, logo, quick actions) — aceptada a propósito.
- Dos slugs que el usuario debe gestionar si quiere ambos canales.

## Alternativas consideradas

1. **Tabla única `broker_channels` con `type`** — más normalizado pero refactor grande; pospuesto.
2. **Widget como JSON en micrositio** — rechazado; acoplamiento y publicación independiente imposible.
3. **Mantener FK pero opcional** — rechazado; semántica confusa y RLS más complejo.

## Referencias

- `src/lib/widget-server.ts`
- `src/lib/widget-channel.ts`
- `supabase/migrations/018_broker_web_widgets.sql`
- `supabase/migrations/020_widget_standalone.sql`
