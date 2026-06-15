# NOOVA 360 — Especificación del Lead (Oportunidad)
**Para:** Equipo de desarrollo  
**De:** Founder (vía copiloto estratégico)  
**Objetivo:** El lead es la **oportunidad comercial** que ORI y la IA mueven a través del pipeline. No es un CRM de tareas manuales ni un tablero de forecasting.

> **¿Qué oportunidad hay que cerrar, en qué etapa está, y cómo ayuda ORI a cotizarla?**

**Relación con otros specs:** complementa [NOOVA360_Spec_Ficha_Contacto.md](./NOOVA360_Spec_Ficha_Contacto.md). El contacto es *quién*; el lead es *qué oportunidad* se está negociando.

---

## 0. Principios de diseño (v2 — junio 2026)

1. **ORI es transversal.** El mismo asistente de cotización vive en contacto y lead. ORI lee contexto del contacto + oportunidad y redacta cotizaciones con el conocimiento del tenant.
2. **La IA mueve y llena.** Campos del lead (`stage_id`, `categoria_interes`, `score`, `motivo_perdida`, etc.) se actualizan desde conversación con `field_provenance`. El asesor puede corregir; el kanban manual es override.
3. **Sin campos manuales de “próxima acción”.** No hay `proxima_accion` / fecha / tipo en ficha. Si ORI sugiere algo, será en su módulo (avisos, cotización, chat) — no como formulario CRM.
4. **Contacto obligatorio.** Todo lead tiene `contact_id` NOT NULL.
5. **Flaco.** Sin comisiones, forecasting pesado ni motor de cotización embebido completo — eso es ORI + conocimiento del tenant.

---

## 1. Estado actual en Noova

| Área | Implementado | Ubicación |
|---|---|---|
| Tabla `crm_leads` | contacto obligatorio, etapa, resultado, valor, categoría/producto interés, score, temperatura, motivo pérdida, `field_provenance`, `stage_entered_at` | `026_crm.sql`, `028`, `030`, `031` |
| Pipeline configurable | `crm_pipeline_stages` por tenant | `/dashboard/crm/configuracion` |
| Etapas default | Nuevo → Contactado → Cotizado → Negociación | `DEFAULT_CRM_STAGES` |
| Kanban | Drag manual + tarjetas con categoría, temperatura, días en etapa | `CrmLeadsKanban.tsx` |
| Ficha lead | Oportunidad, pipeline, contacto, asignación + **ORI cotización** | `CrmLeadForm.tsx`, `CrmOriQuotePanel.tsx` |
| Ficha contacto | Mismo panel ORI + captura IA + documentos | `CrmContactAiTools.tsx` |
| Cotización API | `POST /api/crm/contacts/[id]/quote`, `POST /api/crm/leads/[id]/quote` | `crm-ai-extract.ts` |

**Eliminado (v2):** campos manuales `proxima_accion*`, filtros vencidos/estancados, mini-timeline en lead, Fase B (cron alertas).

---

## 2. ORI — asistente transversal

ORI acompaña todo el proceso comercial:

| Momento | Qué hace ORI | Dónde |
|---|---|---|
| Conversación activa | Captura campos de contacto y lead; propone/mueve etapa | Inbox + `ai-capture` (fase C) |
| Cotización | Genera borrador con conocimiento del tenant + datos contacto/lead | Ficha contacto, ficha lead |
| Etapa Cotizado | Dispara o sugiere cotización automáticamente | Fase C — analizar conversación |
| Negociación / cierre | Detecta objeciones, cierre, pérdida con motivo | Fase C — `analyzeLeadFromConversation` |

### Módulo compartido: `CrmOriQuotePanel`

- Componente único usado en contacto y lead.
- Endpoint según contexto: contacto solo, o lead con contexto de oportunidad (categoría, producto, etapa, valor).
- Salida: cotización larga + mensaje WhatsApp corto; copiar / abrir inbox.
- Evolución: alimentar con **company context** / tarifarios del tenant para cotizar con datos reales cuando existan.

---

## 3. Modelo de datos del lead

### 3.1 Vínculo y oportunidad

| Campo | Tipo | Obligatorio | Quién lo llena |
|---|---|---|---|
| `contact_id` | uuid | **Sí** | Sistema / manual |
| `title` | string | Sí | IA / manual |
| `categoria_interes` | string | No | IA / manual (fallback contacto al crear) |
| `producto_interes` | string | No | IA / manual |

### 3.2 Etapa

| Campo | Tipo | Quién lo llena |
|---|---|---|
| `stage_id` | uuid | **IA** (default) / manual override |
| `stage_entered_at` | timestamp | Sistema al cambiar etapa |
| `dias_en_etapa` | derivado | Sistema |

Etapas default: **Nuevo · Contactado · Cotizado · Negociación**. Ganado/Perdido = `outcome`, no etapa.

### 3.3 Resultado

| Campo | Tipo | Notas |
|---|---|---|
| `outcome` | `open` \| `won` \| `lost` | Kanban = solo `open` |
| `motivo_perdida` | enum | Obligatorio si `lost` |
| `motivo_perdida_detalle` | string | Opcional |

### 3.4 Valor y prioridad

| Campo | Tipo | Quién lo llena |
|---|---|---|
| `value_amount`, `currency` | numeric, string | IA / manual |
| `score` | 0–100 | IA (engagement) |
| `temperatura` | frio/tibio/caliente | Derivado de score o IA |

### 3.5 Asignación y atribución

| Campo | Tipo |
|---|---|
| `asesor_responsable` | string |
| `source` / `fuente_origen` | enum texto |
| `inbox_conversation_id` | uuid (copia del contacto al crear) |
| `fecha_ultima_interaccion` | timestamp (sistema, fase C) |
| `field_provenance` | jsonb — misma estructura que contacto |

### 3.6 Lo que NO va en el lead

- `proxima_accion`, `proxima_accion_fecha`, `proxima_accion_tipo`, `proxima_accion_estado`
- Mini-timeline de actividad (vive en ficha contacto)
- Cron de “acciones vencidas” o alertas de estancamiento automáticas (Fase B descartada)

---

## 4. UI

### 4.1 Kanban

Tarjeta muestra: título, contacto, categoría/producto, temperatura, días en etapa, valor, asesor.

Filtros: **Abiertos · Míos · Ganados · Perdidos · Todos**.

### 4.2 Ficha lead

Bloques:

1. **ORI — Asistente de cotización** (panel compartido)
2. **Oportunidad** — título, categoría, producto, valor, score/temperatura
3. **Pipeline** — etapa, resultado, motivo pérdida
4. **Contacto** — obligatorio
5. **Asignación** — asesor, fuente, notas

### 4.3 Creación

- Desde contacto: prellenar `contact_id`, categoría, fuente, inbox.
- Desde IA (fase C): crear lead al detectar intención de compra/cotización.

---

## 5. Movimiento de etapa por IA (Fase C — implementado)

La IA interpreta la conversación y aplica los **criterios configurables por etapa** (`ai_enter_criteria`), no reglas fijas en código.

| Capa | Rol |
|---|---|
| Criterio por etapa (config CRM) | Regla del tenant: "mover aquí cuando…" |
| ORI / Gemini | Lee conversación + criterios → etapa, campos, outcome |
| Enrich automático | Tras inbound WA y respuesta humana en inbox |

- Crea lead si hay intención de compra/cotización (confianza media+).
- Mueve etapa si cumple criterio (alta siempre; media solo hacia adelante).
- Ganado/perdido solo con confianza alta.
- `field_provenance` en cada campo tocado.
- Al entrar en Cotizado → cotización ORI automática (con company context).

Manual: **Sincronizar pipeline con IA** (ficha lead) o **Analizar pipeline** (ficha contacto).

---

## 6. Ganado → Producto/Servicio (futuro)

Fuera de alcance actual. Contrato: al `won`, crear `producto_servicio` en contacto e iniciar cadencia renovación (spec dedicada).

---

## 7. Plan de implementación

### Fase A — Hecho ✓

- [x] Columnas lead enriquecidas (sin próxima acción manual)
- [x] `contact_id` NOT NULL (migración 031)
- [x] APIs + ficha + kanban
- [x] `CrmOriQuotePanel` en contacto y lead
- [x] `POST /api/crm/leads/[id]/quote` con contexto de oportunidad

### Fase B — Descartada

Cron de vencidas, estancamiento automático, filtros vencidos/estancados.

### Fase C — IA + ORI ✓

- [x] `analyzeLeadFromConversation` — criterios por etapa + conversación
- [x] Auto-crear lead desde WhatsApp con intención de compra
- [x] Enrich automático en inbound WA + respuesta humana inbox
- [x] ORI cotización con company context (conocimiento del tenant)
- [x] `field_provenance` en escrituras IA del lead
- [x] Auto-cotización al mover a Cotizado
- [x] UI criterios IA por etapa en `/dashboard/crm/configuracion`

### Fase D — Automatización + ganado

- [ ] Disparadores por etapa
- [ ] `won` → `producto_servicio`

---

## 8. Criterios de aceptación (QA)

1. No se puede crear/guardar lead sin `contact_id`.
2. No existen campos de próxima acción en UI ni validación API.
3. ORI cotización funciona igual en ficha contacto y ficha lead.
4. Cotización desde lead incluye categoría/producto/etapa de la oportunidad.
5. Mover etapa manual actualiza `stage_entered_at`.
6. Marcar `lost` exige `motivo_perdida`.
7. Kanban muestra temperatura y categoría sin abrir ficha.
8. Campos IA muestran badge de procedencia (fase C).

---

## 9. Fuera de alcance

- Producto/Servicio y renovaciones (spec dedicada)
- Tareas/recordatorios standalone
- Forecasting y reportería BI
- Duplicar teléfono/ventana WA del contacto en el lead
