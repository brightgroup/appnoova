# Export marketing — noova360.com

Copia lista de la **landing principal** (`/`) y **IA Seguros** (`/iaseguros`) para migrar el sitio informativo al dominio raíz `noova360.com`, dejando la app en `app.noova360.com`.

Exportado desde el repo `appnoova` (rama main). No es un proyecto Next.js completo: es el paquete de páginas + componentes + dependencias mínimas.

---

## Qué incluye

| Ruta destino | Origen |
|---|---|
| `noova360.com/` | `src/app/page.tsx` → `NoovaLandingPage` |
| `noova360.com/iaseguros` | `src/app/iaseguros/*` → `IaSegurosLandingPage` |

También: captura de leads, sección de precios, widget embed (seguros), logo, `NoovaSelect`, helpers de leads/widget.

## Qué NO incluye (sigue en app)

- Login / signup / dashboard (`/login`, `/signup`, …)
- APIs de billing, CRM, WhatsApp, voz
- `docs/PRICING.md` (referencia interna; **no** es la fuente de verdad de la UI)

---

## Cómo sincronizar precios y créditos (importante)

Hoy la landing **ya no hardcodea** planes/créditos de forma aislada: `PricingSection` lee el catálogo vivo:

```
GET https://app.noova360.com/api/pricing/catalog
```

Ese endpoint sale de la misma base que usa facturación/admin (`plans`, `billing_settings`, unit prices, TRM, `pricing_revision`).

### Flujo recomendado (fuente única)

```
Admin cambia precios/créditos en app.noova360.com
        ↓
Supabase (plans + unit prices + revision++)
        ↓
┌───────────────────────┬────────────────────────┐
│  Landing noova360.com │  ORI / asistente web   │
│  usePricingCatalog()  │  lee el mismo catalog  │
│  → /api/pricing/…     │  o tools apuntando ahí │
└───────────────────────┴────────────────────────┘
```

**Regla:** nunca editar números de créditos/precios a mano en el HTML de la landing ni en prompts del asistente. Solo cambiarlos en admin de la app; ambos consumidores se actualizan.

### Qué hacer en el sitio de marketing

1. Define en `.env`:

```env
NEXT_PUBLIC_APP_API_URL=https://app.noova360.com
NEXT_PUBLIC_APP_URL=https://app.noova360.com
NEXT_PUBLIC_LANDING_WIDGET_SLUG=noova
```

2. El hook `usePricingCatalog` (en este export) llama a  
   `${NEXT_PUBLIC_APP_API_URL}/api/pricing/catalog`.

3. El formulario de leads hace POST a  
   `${NEXT_PUBLIC_APP_API_URL}/api/landing/leads`  
   (misma tabla `landing_leads` + email de notificación).

4. Links “Iniciar sesión / Crear cuenta” deben ir a `NEXT_PUBLIC_APP_URL` (`/login`, `/signup`), no a rutas locales del marketing.

### CORS

Para que el browser en `noova360.com` pueda llamar a `app.noova360.com`, el API de la app debe permitir el origen del marketing (ver cambios en el repo app: `Access-Control-Allow-Origin` en catalog + leads). Orígenes típicos:

- `https://noova360.com`
- `https://www.noova360.com`
- (opcional) preview Vercel

Variable sugerida en app: `MARKETING_ORIGINS=https://noova360.com,https://www.noova360.com`

### Asistente / ORI

Para que el copiloto de la web diga los mismos números:

- Preferible: tool o fetch al mismo ` /api/pricing/catalog` en cada pregunta de precios.
- Alternativa: al publicar un cambio de pricing, regenerar un bloque de contexto (“precios vigentes”) que ORI inyecta — pero la fuente sigue siendo el catalog, no un markdown suelto.

`docs/PRICING.md` es documentación humana; si diverge del catalog, gana el **catalog**.

---

## Cómo montarlo en un proyecto Next.js nuevo

1. Crea un Next.js (App Router) + Tailwind + `lucide-react` + `next/font` Poppins (como el layout actual).
2. Copia `src/` y `public/logo-noova.png` de este export.
3. Asegura alias `@/` → `src/`.
4. Copia tokens CSS `--nv-*` / tema dark de `globals.css` del app (la landing usa clases dark + variables).
5. Configura env (arriba).
6. Enlaces absolutos a la app para login/signup/privacy si privacy se queda en app.

### Dependencias npm mínimas

- `next`, `react`, `react-dom`
- `lucide-react`
- Tailwind (mismo setup que app)

---

## Checklist post-migración

- [ ] DNS: `noova360.com` → marketing; `app.noova360.com` → producto
- [ ] Redirects: `app.noova360.com/` y `/iaseguros` → `noova360.com` (301)
- [ ] CORS + env `MARKETING_ORIGINS` en app
- [ ] Landing lee catalog y muestra precios vivos
- [ ] Lead form guarda en `landing_leads`
- [ ] CTAs login/signup apuntan a app
- [ ] Widget `/iaseguros` apunta al slug correcto en app (`NEXT_PUBLIC_LANDING_WIDGET_SLUG`)
- [ ] ORI/asistente usa el mismo catalog para precios

---

## Archivos

Ver `MANIFEST.txt` en esta carpeta. ZIP: `export/marketing-site.zip`.
