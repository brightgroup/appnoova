# Noova 360

Plataforma para corredores y aseguradoras: agentes de texto y voz con IA, canales de atención (Mi Link, widget web, teléfono), inbox unificado y contexto de marca por cliente.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend / API | [Next.js 15](https://nextjs.org/) (App Router) + React 19 |
| Servidor custom | `server.ts` — HTTP + WebSocket Telnyx (puerto **8000**) |
| Base de datos | [Supabase](https://supabase.com/) (Postgres + Auth + Storage) |
| IA texto | Google Gemini (`@google/genai`) |
| IA voz | Gemini Live (navegador + bridge Telnyx) |
| Telefonía | Telnyx (principal), Twilio (legacy opcional) |
| Email | Resend |

## Inicio rápido

```bash
git clone https://github.com/brightgroup/appnoova.git
cd appnoova
npm install
cp .env.example .env.local   # completa las variables
npm run dev
```

Abre **http://127.0.0.1:8000**

> El dev usa el directorio `.next-dev` (no `.next`). Evita `npm run build` mientras el servidor de desarrollo está corriendo.

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup local, migraciones, scripts, convenciones |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, canales, BD, APIs, flujos |
| [docs/ROLLBACK-Y-BACKUPS.md](docs/ROLLBACK-Y-BACKUPS.md) | Rollback de código y backups de BD |
| [docs/PRICING.md](docs/PRICING.md) | Modelo de precios y créditos |
| [docs/adr/001-widget-standalone.md](docs/adr/001-widget-standalone.md) | Decisión: widget independiente de Mi Link |

## Estructura del repo

```
appnoova/
├── server.ts              # Servidor Next + WS telefonía
├── src/
│   ├── app/               # Rutas App Router (dashboard, API, público)
│   ├── components/        # UI por dominio
│   ├── lib/               # Lógica de negocio, clientes Supabase, telefonía
│   └── types/             # Tipos TypeScript compartidos
├── public/
│   └── noova-widget.js    # Script embebible del widget
├── supabase/
│   ├── migrations/        # Migraciones numeradas (001–020)
│   └── APPLY_IN_SUPABASE.sql
├── scripts/               # Migraciones, backup, email de prueba
└── docs/                  # Documentación del proyecto
```

## Scripts npm

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo en puerto 8000 |
| `npm run dev:clean` | Borra `.next-dev` y arranca de cero |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | ESLint |
| `npm run backup:db` | Backup de Postgres (Supabase) |
| `npm run email:test` | Prueba envío Resend |

## URLs principales

| Ruta | Uso |
|------|-----|
| `/` | Landing + widget demo (env) |
| `/dashboard` | Panel del corredor |
| `/dashboard/canales/*` | Configuración de canales |
| `/c/{slug}` | Mi Link público (chat) |
| `/widget/{slug}` | Widget embebible (iframe) |
| `/dashboard/inbox` | Conversaciones de texto |

## Variables de entorno

Copia `.env.example` → `.env.local`. **Nunca** subas `.env.local` a git.

Mínimo para desarrollo local:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` / `NOOVA_APP_URL` (ej. `http://127.0.0.1:8000`)
- `NEXT_PUBLIC_GOOGLE_AI_KEY` (agentes de texto/voz en navegador)
- `SUPABASE_DB_PASSWORD` (solo si aplicas migraciones desde la máquina)

Ver [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) para la lista completa.

## Licencia

Proyecto privado — Bright Group / Noova 360.
