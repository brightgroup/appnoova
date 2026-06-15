# NOOVA 360 — Especificación del Lead (Oportunidad)
**Para:** Equipo de desarrollo  
**De:** Founder (vía copiloto estratégico)  
**Objetivo:** Convertir el kanban de leads en una **capa accionable** para ORI y la IA. El lead responde una sola pregunta:

> **¿Qué hay que hacer con esta oportunidad, y cuándo?**

Todo lo que no ayude a contestar eso sobra. No es un CRM de registro ni un tablero de forecasting.

**Relación con otros specs:** complementa [NOOVA360_Spec_Ficha_Contacto.md](./NOOVA360_Spec_Ficha_Contacto.md). El contacto es *quién*; el lead es *qué oportunidad hay que mover ahora*.

---

## 0. Principios de diseño

1. **Flaco y accionable.** Sin comisiones, cartera, múltiples pipelines corporativos ni motor de cotización embebido (eso es ORI aparte).
2. **Multi-nicho.** El esquema de datos es fijo; **etapas del pipeline** y **labels** son configurables por tenant (igual que contacto).
3. **La IA mueve y llena.** El asesor confirma; no arrastra tarjetas por defecto. El kanban manual sigue existiendo como override.
4. **Sin próxima acción = lead roto.** Ningún lead abierto debe quedar sin `proxima_accion` + `proxima_accion_fecha`.
5. **Procedencia por campo.** Reutilizar el modelo `field_provenance` ya definido en contacto.

---

## 1. Estado actual en Noova (baseline)

Lo que **ya existe** en la app (`main` a junio 2026):

| Área | Implementado hoy | Ubicación |
|---|---|---|
| Tabla `crm_leads` | `contact_id`, `stage_id`, `title`, `value_amount`, `currency`, `source`, `notes`, `outcome`, `sort_order`, `metadata` | `026_crm.sql`, `028_crm_lead_outcome.sql` |
| Resultado | `outcome`: `open` \| `won` \| `lost` (separado de etapas desde migración 028) | `CrmLead`, kanban solo muestra `open` |
| Pipeline configurable | `crm_pipeline_stages` por tenant | `/dashboard/crm/configuracion` |
| Etapas default | Contacto inicial → En seguimiento → En cotización → Negociación | `DEFAULT_CRM_STAGES` en `crm-record.ts` |
| UI kanban | Drag & drop manual entre columnas | `CrmLeadsKanban.tsx` |
| UI lista + filtros | Abiertos / Ganados / Perdidos / Todos | `/dashboard/crm/leads` |
| Ficha lead | Etapa, resultado, valor, moneda, título, contacto, origen, notas | `CrmLeadForm.tsx` |
| Propiedades custom lead | `fecha_cierre`, `probabilidad`, `producto` (en `metadata`) | `DEFAULT_LEAD_PROPERTIES` |
| Vínculo contacto | `contact_id` opcional; enlace a ficha | Lead form + timeline contacto |
| Labels tenant | `categoria_interes`, `producto_servicio`, `asesor_asignado` | Solo en **contacto** hoy (`CrmTenantLabelsPanel`) |
| ORI cotización | Desde ficha contacto, no desde lead | `CrmContactAiTools.tsx` |
| Próximo paso | Sugerencia a nivel **contacto** (`computeContactNextStep`) | `crm-contact-timeline.ts` |

**No existe aún:** `proxima_accion`, `proxima_accion_fecha`, `motivo_perdida`, `score`/`temperatura`, `asesor_responsable` en lead, `field_provenance` en lead, `dias_en_etapa`, `fecha_ultima_interaccion`, automatización por etapa, movimiento de etapa por IA, disparadores ORI al cambiar etapa, nacimiento de `producto_servicio` al ganar.

---

## 2. Labels configurables por tenant

Reutilizar `tenant_label_config` / `CrmTenantLabels` (misma tabla que contacto). Ampliar keys para lead:

| Nombre técnico (fijo) | Label seguros (default) | Label genérico | Uso en lead |
|---|---|---|---|
| `categoria_interes` | Ramo | Categoría de interés | Qué cotizar (ya en contacto; **copiar o referenciar** en lead) |
| `producto_servicio` | Póliza / Producto | Producto / Servicio | Objeto concreto de la oportunidad al ganar |
| `asesor_asignado` | Asesor | Responsable | `asesor_responsable` del lead |

> **Decisión de implementación:** `categoria_interes` puede vivir en el lead como campo propio (recomendado para oportunidades distintas por contacto) o heredarse del contacto si el lead no lo define. Spec: **campo en lead**, con fallback al contacto al crear.

---

## 3. Modelo de datos del lead

Convención: `obligatorio` = no se guarda abierto sin él. `Estado app` indica si ya está en producción.

### 3.1 Vínculo y objeto de la oportunidad

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `contact_id` | uuid → `crm_contacts` | **Sí** (nuevo) / opcional (legacy) | Sistema / manual | Parcial — hoy opcional | Relación obligatoria en spec; migrar leads huérfanos |
| `title` | string | Sí | IA / manual | **Existe** | Resumen corto de la oportunidad |
| `categoria_interes` | string o multi-select | No | IA / manual | **Gap** — hoy en contacto (`categorias_interes`) y metadata `producto` | Label tenant "Ramo". Le dice a ORI qué cotizar |
| `producto_interes` | string | No | IA / manual | Parcial — `metadata.producto` | Nombre del producto/ramo concreto de *esta* oportunidad |

### 3.2 Etapa — el corazón

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `stage_id` | uuid → `crm_pipeline_stages` | Sí | IA / manual | **Existe** | Columna del kanban |
| `stage_entered_at` | timestamp | No | Sistema | **Gap** | Inicio en etapa actual; base para `dias_en_etapa` |
| `dias_en_etapa` | int derivado | — | Sistema | **Gap** | `now - stage_entered_at` |

**Etapas default (seguros)** — alinear nombres en una migración de datos opcional:

| Orden | Spec (seguros) | App hoy | Acción sugerida |
|---|---|---|---|
| 0 | Nuevo | Contacto inicial | Renombrar en `DEFAULT_CRM_STAGES` |
| 1 | Contactado | En seguimiento | Renombrar |
| 2 | Cotizado | En cotización | Renombrar |
| 3 | Negociación | Negociación | OK |

`Ganado` / `Perdido` **no son etapas** — son `outcome` (ya correcto desde migración 028).

### 3.3 Estado y resultado

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `outcome` | enum `open` \| `won` \| `lost` | Sí | IA / manual | **Existe** | Kanban = solo `open` |
| `motivo_perdida` | enum configurable | Condicional si `lost` | IA / manual | **Gap** | Alimenta cadencias de reactivación |
| `motivo_perdida_detalle` | string | No | Manual | **Gap** | Texto libre complementario |

**Enum default `motivo_perdida` (seguros):**

`precio` · `no_respondio` · `compro_otro` · `no_era_momento` · `sin_presupuesto` · `datos_incompletos` · `otro`

### 3.4 Valor y prioridad

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `value_amount` | numeric | No | IA / manual | **Existe** | Prima / monto estimado |
| `currency` | string | Sí | Manual | **Existe** — default `COP` | |
| `score` | int 0–100 | No | Sistema (IA) | **Gap** | Prioriza cola del asesor |
| `temperatura` | enum `frio` \| `tibio` \| `caliente` | No | Sistema (IA) | **Gap** | Derivado de `score` para UI |

> **Reemplazo:** `metadata.probabilidad` (10%–90%) queda **deprecado** a favor de `score`/`temperatura` calculados por engagement (mensajes, respuestas, tiempo en etapa). Mantener lectura legacy en import.

### 3.5 Asignación

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `asesor_responsable` | string → usuario | No | Manual / regla | **Gap** — hoy `asesor_asignado` solo en contacto | Enruta alertas y acciones ORI del lead |

### 3.6 Motor de acción (campo estrella)

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `proxima_accion` | string | **Sí** si `open` | IA / ORI / manual | **Gap** | Qué sigue: "Enviar cotización", "Llamar", "Pedir documento"… |
| `proxima_accion_fecha` | timestamp | **Sí** si `open` | IA / ORI / manual | Parcial — `metadata.fecha_cierre` es distinto | Cuándo ejecutar. Promover a columna |
| `proxima_accion_tipo` | enum | No | Sistema | **Gap** | `whatsapp` \| `llamada` \| `email` \| `cotizacion_ori` \| `tarea_asesor` \| `esperar` |
| `proxima_accion_estado` | enum | No | Sistema | **Gap** | `pendiente` \| `hecha` \| `vencida` \| `cancelada` |

Regla de producto: al cerrar (`won`/`lost`), `proxima_accion` puede quedar histórica pero no bloquea guardado.

### 3.7 Atribución y tiempos

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Estado app | Notas |
|---|---|---|---|---|---|
| `fuente_origen` | enum | No | Sistema / manual | Parcial — columna `source` texto libre | Unificar con enum de contacto (`FUENTE_ORIGEN_OPTIONS`) |
| `fecha_ultima_interaccion` | timestamp | No | Sistema | **Gap** | Último mensaje/llamada vinculada al lead o contacto |
| `inbox_conversation_id` | uuid | No | Sistema | **Gap en lead** — existe en contacto | Copiar al crear lead desde conversación |
| `field_provenance` | jsonb | No | Sistema | **Gap** | Misma estructura que contacto (`CrmFieldProvenance`) |
| `created_at` / `updated_at` | timestamp | Sí | Sistema | **Existe** | |

### 3.8 Propiedades personalizadas

Mantener `crm_property_definitions` con `entity_type = lead` (ya implementado). La válvula multi-nicho. Los campos de §3 reemplazan progresivamente los builtin `fecha_cierre`, `probabilidad`, `producto`.

### 3.9 Procedencia por campo

Igual que contacto — reutilizar `CrmFieldProvenance` / `CrmFieldProvenanceBadge`:

| Metadato | Tipo |
|---|---|
| `origen` | `manual` \| `ia_conversacion` \| `documento` \| `importacion` \| `integracion` \| `ori` |
| `confianza` | `alta` \| `media` \| `baja` |
| `verificado` | bool |
| `actualizado_por` | usuario \| `sistema_ia` \| `ori` |
| `actualizado_en` | timestamp |

---

## 4. UI del lead (ficha + kanban)

### 4.1 Kanban (existente — evolucionar)

**Hoy:** tarjeta muestra título, contacto, valor, origen. Solo drag manual.

**Target mínimo en tarjeta:**

- Título + contacto (ya)
- `temperatura` / `score` (badge)
- `proxima_accion` + fecha relativa ("hoy", "en 2 días", "vencida")
- `asesor_responsable` (inicial)
- Indicador estancado si `dias_en_etapa > umbral` (configurable, default 5 días)

**Filtros nuevos:** "Mis leads", "Sin próxima acción", "Vencidos", "Estancados".

### 4.2 Ficha lead (`/dashboard/crm/leads/[id]`)

Reorganizar `CrmLeadForm` en bloques (como ficha contacto):

1. **Acción ahora** — `proxima_accion` + fecha + botones: Abrir inbox · Cotizar ORI · Marcar hecha  
2. **Oportunidad** — título, categoría, producto, valor, temperatura  
3. **Pipeline** — etapa, resultado, motivo pérdida (si aplica), días en etapa  
4. **Persona** — contacto vinculado (obligatorio) + link a ficha  
5. **Asignación** — asesor responsable  
6. **Contexto** — fuente, notas, propiedades custom  
7. **Actividad** — mini-timeline (mensajes WA + llamadas del contacto filtrados por ventana del lead)

### 4.3 Creación de lead

**Hoy:** `/dashboard/crm/leads/nuevo` manual.

**Target:**

- Desde contacto: prellenar `contact_id`, `categoria_interes`, `fuente_origen`, `inbox_conversation_id`
- Desde IA: crear lead cuando detecte intención de compra/cotización en conversación
- Siempre setear `proxima_accion` inicial (ej. "Responder en WhatsApp" + `now`)

---

## 5. Capa accionable — automatización por etapa

Esto es lo que convierte el kanban en motor Noova (no existe hoy; diseñar en `crm_stage_automations` o `metadata` de etapa).

### 5.1 Movimiento de etapa por IA

| Evento conversación | Etapa destino sugerida | Registro |
|---|---|---|
| Primer inbound / lead creado | Nuevo | `field_provenance.stage_id` |
| IA o asesor respondió | Contactado | + motivo en log |
| Usuario pidió cotización / precio | Cotizado | Disparar ORI |
| Objeciones, comparación, negociación activa | Negociación | Alerta asesor |
| Cierre positivo confirmado | `outcome = won` | Ver §6 |
| Rechazo explícito | `outcome = lost` + `motivo_perdida` | Cadencia según motivo |

La IA **propone** el cambio; en v1 puede auto-aplicar con confianza alta y dejar badge "pendiente verificar" en la ficha.

### 5.2 Disparadores por etapa (entrada)

| Etapa | Disparador al entrar |
|---|---|
| Cotizado | ORI genera borrador de cotización; opción enviar link por WA si ventana abierta |
| Negociación | Notificación push/email al `asesor_responsable` |
| Cualquiera | Recalcular `proxima_accion` vía ORI |

### 5.3 Alertas de estancamiento

Si `dias_en_etapa >= X` (tenant, default 5) **y** `outcome = open`:

1. ORI sugiere reactivación en ficha + kanban (borde ámbar)
2. Si `score` alto → priorizar en cola "Mis leads"
3. Opcional v2: IA envía plantilla WA si ventana cerrada y motivo lo permite

### 5.4 Pérdida → reactivación

| `motivo_perdida` | Cadencia sugerida |
|---|---|
| `no_respondio` | Plantilla a 7 / 14 / 30 días |
| `precio` | Recontacto al cambio de producto o en renovación competidor |
| `no_era_momento` | Recordatorio en `proxima_accion_fecha` + 90 días |
| `compro_otro` | Baja prioridad; cross-sell otro ramo |

Implementar como reglas en ORI / jobs — el lead solo **almacena** el motivo y la próxima fecha.

---

## 6. Conexión con renovaciones (Ganado → Producto/Servicio)

**Fuera de alcance de esta entrega** (spec futura `Producto/Servicio`), pero el contrato del lead al ganar:

```
lead.outcome = won
  → crear producto_servicio (contact_id, categoria, value_amount, fecha_inicio, fecha_vencimiento)
  → contact.tipo_relacion = cliente (si aplica)
  → iniciar cadencia renovación (voz / WA / ORI)
  → cerrar proxima_accion del lead como "hecha"
```

El lead **no administra** la póliza; solo dispara el objeto siguiente y registra el cierre.

---

## 7. Integración ORI

| Acción ORI | Cuándo | Datos que lee del lead |
|---|---|---|
| Sugerir próxima acción | Al abrir ficha / cada inbound | etapa, timeline, `categoria_interes`, ventana WA contacto |
| Mover etapa | Tras analizar conversación | intención, keywords cotización/cierre |
| Generar cotización | Etapa Cotizado o botón manual | contacto + `categoria_interes` + `producto_interes` |
| Priorizar cola | Dashboard asesor | `score`, `proxima_accion_fecha`, estancamiento |

**Hoy:** cotización ORI solo desde contacto. **Target:** mismo endpoint, invocado con `lead_id` para contexto y logging.

---

## 8. Lo que NO va en el lead

- Forecasting / pipeline weighting complejo
- Comisiones por venta
- Múltiples pipelines con reglas empresariales pesadas
- Motor de cotización completo (ORI)
- Reportería BI extensa
- Duplicar datos de contacto (teléfono, ventana WA) — **leer del contacto**

---

## 9. Plan de implementación sugerido (fases)

### Fase A — Datos y ficha (1 sprint)

- [ ] Migración SQL: columnas `proxima_accion`, `proxima_accion_fecha`, `proxima_accion_tipo`, `motivo_perdida`, `asesor_responsable`, `categoria_interes`, `score`, `temperatura`, `stage_entered_at`, `fecha_ultima_interaccion`, `field_provenance`, `inbox_conversation_id`
- [ ] Hacer `contact_id` NOT NULL en leads nuevos; backfill huérfanos
- [ ] Renombrar etapas default (opcional, solo nuevos tenants)
- [ ] Actualizar `CrmLead` type + `toCrmLead` + APIs CRUD
- [ ] Rediseñar `CrmLeadForm` con bloque "Acción ahora"
- [ ] Enriquecer tarjetas kanban (próxima acción, temperatura)

### Fase B — Tiempos y alertas (0.5 sprint)

- [ ] Job/cron: `dias_en_etapa`, marcar `proxima_accion_estado = vencida`
- [ ] Filtros kanban: vencidos, estancados, mis leads
- [ ] Badge estancamiento en UI

### Fase C — IA + ORI (1–2 sprints)

- [ ] Servicio `analyzeLeadFromConversation` → propone etapa, score, próxima acción
- [ ] Auto-crear lead desde WhatsApp cuando detecte oportunidad
- [ ] Cotización ORI desde ficha lead
- [ ] `field_provenance` en escrituras IA

### Fase D — Automatización etapa + ganado (spec Producto/Servicio)

- [ ] Tabla disparadores por etapa
- [ ] Webhook interno al cambiar `stage_id`
- [ ] Flujo `won` → `producto_servicio`

---

## 10. Criterios de aceptación (QA)

1. Un lead abierto no se puede guardar sin `proxima_accion` y `proxima_accion_fecha`.
2. El kanban muestra la próxima acción y fecha en cada tarjeta sin abrir la ficha.
3. Mover etapa manualmente actualiza `stage_entered_at` y reinicia `dias_en_etapa`.
4. Marcar `lost` exige `motivo_perdida`.
5. Recargar el kanban no pierde estado de UI; datos de lead persisten.
6. Crear lead desde contacto hereda `categoria_interes` y `fuente_origen`.
7. Campos llenados por IA muestran badge de procedencia no verificada.
8. Lead estancado (>5 días en etapa) se resalta visualmente.
9. `outcome = won` saca el lead del kanban (ya funciona) y deja historial en contacto.
10. ORI puede leer el lead y proponer una próxima acción en lenguaje natural.

---

## 11. Mapa rápido spec → código actual

| Concepto spec | Campo / artefacto hoy | Acción |
|---|---|---|
| `contacto_asociado` | `contact_id` | Hacer obligatorio |
| `categoria_interes` | `contact.categorias_interes` | Columna en lead + fallback |
| `etapa` | `stage_id` | OK |
| `estado` | `outcome` | OK |
| `valor_estimado` | `value_amount` | OK |
| `asesor_responsable` | `contact.asesor_asignado` | Columna en lead |
| `proxima_accion` | — | **Crear** |
| `proxima_accion_fecha` | `metadata.fecha_cierre` (distinto) | **Crear**; deprecar fecha_cierre |
| `fuente_origen` | `source` (texto) | Tipar como enum |
| `motivo_perdida` | — | **Crear** |
| `score` / `temperatura` | `metadata.probabilidad` | **Crear**; deprecar probabilidad |
| `producto` oportunidad | `metadata.producto` | Promover a `producto_interes` |
| Procedencia | `contact.field_provenance` | `field_provenance` en lead |
| Kanban accionable | drag manual | Enriquecer UI + IA en fases C/D |

---

## 12. Fuera de alcance de este documento

- Objeto **Producto/Servicio** y cadencias de renovación (spec dedicada)
- Objeto **Tarea/Recordatorio** standalone (puede mapearse a `proxima_accion` hasta entonces)
- Timeline omnicanal completo (parcialmente en ficha contacto; mini-timeline en lead es stretch Fase A)
