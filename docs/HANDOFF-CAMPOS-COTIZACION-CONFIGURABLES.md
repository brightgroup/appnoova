# Handoff: campos de cotización configurables + botones deterministas

Documento para que **otro agente (Opus, modo Plan) arranque desde cero** sin el chat anterior.

- Repo: `/Users/johngarcia/appnoova`
- Plan interno de Cursor (si existe): `campos_cotizacion_configurables` / `.cursor/plans/campos_cotizacion_configurables_cdeb498a.plan.md`
- Fecha del handoff: 14 de septiembre de 2026
- Chat origen: conversación de prueba WhatsApp “seguro autos” (Lucia / Resguarda)

---

## Tu rol

Trabajas en **Noova**: Next.js (App Router) + Supabase, TypeScript. Código y comentarios en español. Plataforma CRM/automatización con módulo de **seguros** para corredores colombianos.

Hay agentes de IA (“agentes de texto”) que atienden al **cliente final** por WhatsApp (Twilio) y chat web embebido, más un asistente interno **ORI**.

**Arranca en modo Plan.** No implementes hasta que el usuario apruebe. Verifica cada afirmación técnica de este archivo (fueron comprobadas en otra sesión; el código puede haber cambiado).

---

## Cómo llegamos acá

El usuario estaba probando cotización **ramo por ramo** por WhatsApp y reportó dos problemas:

1. **La IA le contaba al cliente los errores técnicos** (“hubo un problema al conectar”, “inconveniente técnico”). Al cliente final no le importa si cotiza la IA o un asesor: debe decir que un asesor le confirmará el precio.
2. **Los botones interactivos de WhatsApp no aparecían.** Las preguntas de opción cerrada salían como listas en texto plano.

Después, un cliente le preguntó **cómo cambiar uno de esos formularios**. El usuario quiere que sea **configurable en la UI del módulo de seguros**, por organización, y que los botones salgan bien (no solo texto). También mencionó que un cliente **que no sea corredor** podría querer lo mismo: dejar la puerta abierta a reutilizar el mecanismo.

---

## Lo que ya se hizo (y su estado)

### Problema 1 — cambios locales, sin commit ni deploy confirmado

Hay trabajo local (revisa `git status` y el diff **antes de tocar nada**; confirma con el usuario si ya se desplegó) que introduce `technical: true` en resultados de tools:

- Fallo de backend → no se le explica al cliente; se encola cotización parcial y se dice que un asesor confirmará el precio.
- Error de negocio (ej. placa no encontrada) → sí se le dice al cliente, en lenguaje natural.

Archivos involucrados (pueden diferir del working tree actual):

- `src/lib/insurers/auto-quote-tool.ts`
- `src/lib/insurers/moto-quote-tool.ts`
- `src/lib/insurers/vehicle-data-provider.ts` (`isVehicleLookupTechnicalError`)
- `src/lib/agent-tools/registry.ts` (catch genérico no filtra el mensaje crudo al modelo)
- `src/lib/agent-tools/auto-quote-agent-tool.ts`
- `src/lib/agent-prompt-generator.ts`

Cuando el fallo es técnico, el patrón deseado es `{ ok: true, pendiente: true, technical: true }` (no filtrar `reason` al cliente).

### Problema 2 — diagnóstico con evidencia + mitigación a medias

Se reprodujo el turno exacto contra la API (mismo prompt ~22k chars, mismas 8 tools, mismo mensaje del cliente), 5 corridas por motor:

| Motor | Llamó `presentar_opciones_whatsapp` |
|---|---|
| GPT-4o mini | **0/5** (volvía a `cotizar_seguro_auto` o escribía “**Botones**: Nuevo / Usado” en texto) |
| Gemini 2.5 Flash | **5/5** |

No era un bug de Twilio/plantillas: era el modelo interpretando una instrucción en prosa dentro de un prompt enorme.

**Mitigación aplicada en producción (DB):** el agente **Lucia** (`text_agents.id = 98d77d5f-0669-471c-8c85-cb42e0f76f9f`, org `bd23473f-a2dd-436b-9f4a-5814bb24b1ec`) pasó de `gpt-4o-mini` a `gemini-2.5-flash`. GPT queda de failover automático.

**Prueba en vivo con Gemini:** los botones **sí salieron**, pero apareció un bug nuevo: **pregunta duplicada**. “¿Es de importación directa?” primero en texto plano (sin botones); el cliente dijo “No se”; la IA **volvió a preguntar lo mismo** ya con botones. Causa de raíz: **usar botones vive en un párrafo que la IA interpreta cada turno, no en el código.**

### Hallazgos secundarios (no son bugs de Noova)

- Un mensaje de prueba por automatización de navegador falló con **Twilio 21617** (cuerpo > 1600 caracteres) porque WhatsApp Web duplicó el texto ~15 veces.
- Automatizar el composer de WhatsApp Web (Lexical) **no es confiable** con las tools de browser. Para pruebas en vivo, **pídele al usuario que escriba él**.

---

## Arquitectura actual (verificar en código)

### Media solución ya construida, desconectada de WhatsApp

- **`poliza_ramo_campos`** — `supabase/migrations/137_poliza_ramo_campos.sql`: campos por `(organization_id, ramo_id)`: `field_key`, `label`, `field_type` (`text|number|date|select|boolean`), `options` jsonb, `sort_order`.
  - UI: `/dashboard/seguros/polizas/campos` → `src/components/seguros/PolizaRamoCamposPanel.tsx`
  - DB helper: `src/lib/insurers/poliza-ramo-campos-db.ts`
  - API: `/api/seguros/ramo-campos`
- **`src/lib/insurers/generic-quote-tool.ts`**: lee `getRamoCampoDefinitions()` y devuelve `faltan_datos: [{key, label, tipo, opciones}]`. Solo `vida`, `hogar`, `salud`.
- **`src/lib/agent-tools/generic-quote-agent-tools.ts`**: `iniciar_cotizacion_seguro` y `registrar_dato_cotizacion`. **No están en** `src/lib/agent-tools/all-text-tools.ts` → WhatsApp no las usa (ORI sí, en parte).
- WhatsApp usa las **6 tools hard-codeadas** en `all-text-tools.ts`: auto, vida, hogar, moto, soat, accidentes + `presentar_opciones_whatsapp` + `radicar_siniestro`.

### Dónde viven hoy las preguntas

Strings en español dentro de `buildPromptBlock()` de cada tool. Ejemplo (`src/lib/agent-tools/auto-quote-agent-tool.ts`): pide placa, luego 5 datos de a uno, “con botones… usa `presentar_opciones_whatsapp` con esas opciones EXACTAS”.

Los 5 campos de riesgo de autos también están en `REQUIRED_RIESGO_FIELDS` en `src/lib/insurers/auto-quote-tool.ts`.

### Restricciones que condicionan el diseño

1. **`buildPromptBlock(ctx)` es síncrono y `AgentToolRulesContext` no tiene `db`** (`src/lib/agent-tools/registry.ts`). Precargar config aguas arriba, como `calendarConnection`. Puntos de carga: `src/lib/whatsapp/process-inbound.ts` (~quotingRules) y `src/app/api/public/microsite/[slug]/chat/route.ts`.
2. **`ramos_catalogo` no tiene MOTOS** (`134_ramos_catalogo.sql`: sí `autos-vehiculos`, `soat`, `accidentes-personales`).
3. **`RAMOS_COTIZABLES`** (`src/lib/insurers/ramos-cotizables.ts`) solo `autos`, `vida`, `hogar`, `salud`. `getRamoCampoDefinitions()` devuelve `[]` para el resto.
4. **`alreadyDeliveredInteractive`** en `process-inbound.ts` (~821) solo mira el **nombre** `presentar_opciones_whatsapp`. Otra tool que envíe interactivo no suprime el texto duplicado.
5. **Límites WhatsApp** (`whatsapp-options-tool.ts`): máx. 3 botones o 10 filas; títulos `slice(0, 20)` / `slice(0, 24)`. Caso real: “A nombre de otra persona” → “A nombre de otra per”. La UI debe advertirlo.
6. **Solo autos tiene cotización automática** (La Equidad, `la-equidad.ts`), incompleta (sin `Detail`/Fasecolda). El resto es cola humana (`insurance_quote_requests`). Los 5 campos de riesgo de autos son **informativos para el asesor**, no van a la aseguradora hoy.

### Interruptor actual del agente

`quoting_rules` en `text_agents`: `{ enabled, autoQuote, insurer_connection_ids }`. UI: tab Conectores en configuración del agente (`AgentConnectorsPanel`). **No hay** editor de preguntas/botones.

---

## Decisiones del usuario (no volver a preguntar)

1. **Alcance: todos los ramos, incluido autos.** Autos conserva en código placa + Verifik/PlacApi; las 5 preguntas de riesgo salen de la config.
2. **Determinismo: híbrido, con dos guardas.** Palabras del usuario: *“no quiero que mande un listado grande solo porque le dijimos que siempre use, es mejor híbrido pero que no repita las mismas preguntas.”*
   - El **código** fuerza el interactivo en campos de cotización.
   - Nunca lista gigante “porque sí”.
   - Nunca repetir la misma pregunta en texto + botones.
   - La IA **sigue** pudiendo usar `presentar_opciones_whatsapp` para decisiones sueltas (plan, confirmar).

---

## Plan a ejecutar (cuando el usuario lo apruebe)

### 1. Migración

Nueva migración (verifica el número siguiente; puede existir `144_bold_billing.sql` u otras sin commit). Propuesta `145_ramo_campos_cotizacion.sql`:

```sql
alter table public.poliza_ramo_campos
  add column if not exists pregunta              text,
  add column if not exists ayuda                 text,
  add column if not exists presentacion          text not null default 'auto'
    check (presentacion in ('auto','botones','lista','texto')),
  add column if not exists aplica_cotizacion     boolean not null default true,
  add column if not exists requerido_cotizacion  boolean not null default true;

insert into public.ramos_catalogo (nombre, slug) values ('MOTOS', 'motos')
  on conflict (slug) do nothing;
```

- `pregunta`: lo que dice la IA (si null, usa `label`).
- `ayuda`: “¿qué significa?” (ej. importación directa).

### 2. Defaults en código + override en DB

Nuevo `src/lib/insurers/ramo-campos-defaults.ts`: traducción 1:1 de los `buildPromptBlock` actuales de los 6 ramos. **Léelos, no los reinventes.**

`getRamoCampoDefinitions()`: si la org tiene filas para el ramo, esas; si no, defaults. Ampliar `RAMOS_COTIZABLES` con `motos`, `soat`, `accidentes_personales` y sus `catalogoSlug`.

### 3. Helper determinista (ramo-agnóstico)

Nuevo `src/lib/agent-tools/guided-questions.ts`:

- `presentacion: 'auto'` + 2–3 opciones → botones; 4–10 → lista; **>10, `'texto'`, o sin opciones → no envía**, pregunta en texto.
- Solo WhatsApp (`outboundWhatsAppChannel` + `contactE164`).
- Resultado de tools de cotización: `siguiente_pregunta` + `pregunta_enviada: true` si envió.

### 4. Suprimir texto duplicado

Extender `alreadyDeliveredInteractive` para `pregunta_enviada === true` **además** del nombre de tool actual.

### 5. Prompts desde config

`buildPromptBlock` de los 6 ramos se genera desde `ctx.ramoCampos`. **No** le pidas a la IA que decida usar botones. Dile: pregunta de a uno; **si `pregunta_enviada: true`, no escribas la pregunta**.

Agregar `ramoCampos` a `AgentToolRulesContext` y precargarlo junto a `quotingRules`.

Autos: `REQUIRED_RIESGO_FIELDS` config-driven. **No tocar** lookup de placa.

### 6. UI

Extender `PolizaRamoCamposPanel` (pregunta, ayuda, presentación, requerido). Montar sección **“Preguntas que hace la IA”** en `/dashboard/seguros/configuracion` (donde ya se eligen ramos ofrecidos). Defaults pre-cargados; se materializan al primer guardado. Vista previa botones/lista/texto + warning de 20 caracteres.

Extender `/api/seguros/ramo-campos` con las columnas nuevas.

### Fuera de alcance

- Form builder genérico para agentes que no son de seguros (el helper sí se escribe reutilizable).
- Mapeo Detail/Fasecolda → La Equidad.
- Agentes de voz.

### Verificación (el usuario lo pidió explícito)

Levantar local (puerto **8000**, revisa `package.json` y terminales). Mostrar la UI de config con autos pre-cargado. Cambiar una pregunta. Reprobar WhatsApp: botones a la primera, **sin** pregunta duplicada. El usuario escribe los mensajes.

---

## Datos para depurar

| Qué | Valor |
|---|---|
| Agente Lucia | `98d77d5f-0669-471c-8c85-cb42e0f76f9f` |
| Organización | `bd23473f-a2dd-436b-9f4a-5814bb24b1ec` |
| Modelo actual | `gemini-2.5-flash` |
| WhatsApp negocio | `+573214021250` |
| Canal | `553c32ef-3f7a-4627-81a1-719e34ead4ed` (Twilio, subcuenta) |
| Números de prueba | `+573003105733`, `+573152501481` |

Conversaciones: `text_agent_conversations.messages` jsonb, `metadata.whatsapp_contact_e164`. **`updated_at` lo tocan jobs de CRM** — no sirve como “llegó un mensaje nuevo”.

Credenciales: `.env.local`. Logs de Coolify **no** están en local; depurar con Supabase + API Twilio.

---

## Archivos clave (mapa rápido)

```
src/lib/agent-tools/all-text-tools.ts
src/lib/agent-tools/registry.ts
src/lib/agent-tools/whatsapp-options-tool.ts
src/lib/agent-tools/auto-quote-agent-tool.ts
src/lib/agent-tools/moto-quote-agent-tool.ts
src/lib/agent-tools/life-quote-agent-tool.ts
src/lib/agent-tools/home-quote-agent-tool.ts
src/lib/agent-tools/soat-quote-agent-tool.ts
src/lib/agent-tools/accident-quote-agent-tool.ts
src/lib/agent-tools/generic-quote-agent-tools.ts
src/lib/insurers/generic-quote-tool.ts
src/lib/insurers/quote-guidance.ts
src/lib/insurers/ramos-cotizables.ts
src/lib/insurers/auto-quote-tool.ts
src/lib/insurers/quoting-rules.ts
src/lib/whatsapp/process-inbound.ts
src/lib/whatsapp/twilio-content.ts
src/app/dashboard/seguros/configuracion/page.tsx
src/app/dashboard/seguros/polizas/campos/
src/components/seguros/PolizaRamoCamposPanel.tsx
supabase/migrations/137_poliza_ramo_campos.sql
supabase/migrations/134_ramos_catalogo.sql
```
