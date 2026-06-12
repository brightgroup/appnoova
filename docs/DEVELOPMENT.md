# Guía de desarrollo — Noova 360

## Requisitos

- **Node.js** 20+
- **npm** 10+
- Cuenta **Supabase** (proyecto con Auth habilitado)
- **Google AI Studio** API key (texto/voz)
- Opcional: **Telnyx**, **Resend** (según lo que vayas a probar)

## Setup local

```bash
git clone https://github.com/brightgroup/appnoova.git
cd appnoova
npm install
cp .env.example .env.local
```

Completa `.env.local`. Como mínimo:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NEXT_PUBLIC_APP_URL=http://127.0.0.1:8000
NOOVA_APP_URL=http://127.0.0.1:8000
NEXT_PUBLIC_GOOGLE_AI_KEY=<google_ai_key>
SUPABASE_DB_PASSWORD=<db_password>   # para migraciones CLI
```

Arranca:

```bash
npm run dev
```

La app escucha en **http://127.0.0.1:8000** (configurable con `PORT`).

### Caché de desarrollo

`npm run dev` usa `NEXT_DIST_DIR=.next-dev`. Si ves errores raros de CSS o chunks:

```bash
npm run dev:clean
```

No ejecutes `npm run build` con el dev server activo: puede corromper `.next-dev`.

## Base de datos y migraciones

### Estructura

- `supabase/migrations/NNN_*.sql` — migraciones incrementales (aplicar en orden).
- `supabase/APPLY_IN_SUPABASE.sql` — script consolidado para proyectos nuevos o referencia.

### Aplicar migraciones desde tu Mac

Requiere `SUPABASE_DB_PASSWORD` en `.env.local` (Dashboard → Settings → Database).

```bash
# Una migración específica
node scripts/apply-supabase-migration.mjs supabase/migrations/020_widget_standalone.sql

# Script consolidado completo (proyecto vacío)
node scripts/apply-supabase-migration.mjs supabase/APPLY_IN_SUPABASE.sql
```

El script prueba varias URLs de conexión Postgres (directa, pooler Supabase).

### Verificar esquema

En Supabase SQL Editor:

```sql
select column_name from information_schema.columns
where table_name = 'broker_web_widgets' order by 1;
```

Tras migración 020 debe existir `user_id` y `slug`, **sin** `microsite_id`.

## Scripts útiles

| Script | Comando | Descripción |
|--------|---------|-------------|
| Backup BD | `npm run backup:db` | Dump Postgres a `backups/` |
| Email test | `npm run email:test` | Prueba Resend |
| Config SMTP Auth | `npm run email:configure-supabase` | Configura Resend en Supabase Auth |
| Check voz | `node scripts/check-voice-agents.mjs` | Diagnóstico agentes de voz |

## Convenciones de código

### Carpetas

| Ruta | Responsabilidad |
|------|-----------------|
| `src/app/` | Rutas, API handlers, layouts |
| `src/components/` | UI por dominio (`microsite/`, `widget/`, `telephony/`, …) |
| `src/lib/` | Lógica reutilizable, sin JSX |
| `src/types/` | Interfaces compartidas |
| `src/hooks/` | Hooks React |

### Patrones

- **API routes** validan sesión con `getTextAgentUserIdFromRequest` o equivalente.
- **Chat público** usa `textAgentsAdminClient()` (service role).
- **Errores de tabla/columna** — helpers en `supabase-table-error.ts` para mensajes `dbReady: false`.
- **Slugs** — `slugifyBrandName`, `isValidMicrositeSlug` en `microsite-slug.ts`.

### TypeScript

```bash
npx tsc --noEmit
```

### Lint

```bash
npm run lint
```

## Probar canales localmente

### Mi Link

1. Dashboard → Canales → Mi Link → crear/publicar.
2. Asignar agente de texto.
3. Abrir `http://127.0.0.1:8000/c/{tu-slug}`.

### Widget

1. Dashboard → Canales → Widget web → crear/publicar (slug propio).
2. Abrir `http://127.0.0.1:8000/widget/{slug}`.
3. Embebido:

```html
<script
  src="http://127.0.0.1:8000/noova-widget.js"
  data-slug="tu-slug"
  data-base="http://127.0.0.1:8000"
  data-color="#5b5bf6"
  async
></script>
```

### Landing con widget demo

En `.env.local`:

```env
NEXT_PUBLIC_LANDING_WIDGET_SLUG=noova
NEXT_PUBLIC_LANDING_WIDGET_COLOR=#242ac6
```

`?preview=1` en la landing muestra widget en borrador.

### Inbox

Dashboard → Inbox. Filtra conversaciones de agentes de texto. Canales `web_widget` vs `web_embed` aparecen según origen.

## Telefonía en local

Los webhooks de Telnyx requieren URL **HTTPS pública**. En desarrollo:

- Usa `NOOVA_APP_URL` apuntando a producción para webhooks reales, o
- ngrok / túnel hacia `localhost:8000`.

WebSocket media local: `server.ts` en puerto 8000, path `/telephony/ws/telnyx-media`.

## Variables de entorno

Referencia completa en `.env.example`. Grupos:

| Grupo | Variables |
|-------|-----------|
| Supabase | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `DATABASE_URL` |
| App URL | `NEXT_PUBLIC_APP_URL`, `NOOVA_APP_URL`, `NEXT_PUBLIC_LINK_BASE_URL` |
| Google AI | `NEXT_PUBLIC_GOOGLE_AI_KEY`, `ORI_GOOGLE_AI_KEY`, `ORI_GEMINI_MODEL` |
| Widget landing | `NEXT_PUBLIC_LANDING_WIDGET_SLUG`, `NEXT_PUBLIC_LANDING_WIDGET_COLOR` |
| Telnyx | `TELEPHONY_PROVIDER`, `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID` |
| Pipecat | `PIPECAT_WS_URL`, `PIPECAT_INTERNAL_SECRET` |
| Email | `RESEND_*`, `LANDING_LEAD_NOTIFY_EMAIL`, `NOOVA_ADMIN_EMAIL` |
| Link host | `MICROSITE_LINK_HOST`, `NEXT_PUBLIC_MICROSITE_PATH` |

**Nunca** commitees `.env.local` ni valores reales de keys.

## Despliegue

1. `npm run build`
2. `npm run start` (o proceso PM2/Docker en Coolify)
3. Variables de entorno en el servidor
4. `NOOVA_APP_URL=https://app.noova360.com`

Rollback: ver [ROLLBACK-Y-BACKUPS.md](ROLLBACK-Y-BACKUPS.md).

## Troubleshooting

| Problema | Solución |
|----------|----------|
| `503 dbReady: false` en widget | Aplicar migraciones 018–020 |
| Chat no responde | Verificar agente asignado y `is_published` |
| Typing infinito en handoff humano | `handoff_mode` debe ser `human`; revisar `WebChatWidget.tsx` |
| Webhooks Telnyx 404 | `NOOVA_APP_URL` incorrecta o app no accesible |
| CSS roto en dev | `npm run dev:clean` |

## Contribuir

1. Rama desde `main`
2. Cambios + `npx tsc --noEmit`
3. PR con descripción y plan de prueba
4. Si hay migración SQL, incluir archivo en `supabase/migrations/` y actualizar `APPLY_IN_SUPABASE.sql` si aplica
