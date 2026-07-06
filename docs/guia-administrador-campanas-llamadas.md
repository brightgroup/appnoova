# Guía del administrador — Campañas de llamadas con IA

Instructivo para configurar Noova cuando un cliente quiere hacer campañas salientes (50, 250, 500, 1.000, 2.000 llamadas o más). Está escrito **sin lenguaje técnico**: puedes compartirlo con operaciones o soporte.

---

## 1. Dos niveles de configuración (importante)

En Noova hay **dos lugares** distintos. Confundirlos es la causa más común de “la campaña está activa pero no llama”.

| Nivel | Dónde se configura | Quién lo toca | Qué controla |
|-------|-------------------|---------------|--------------|
| **A. Motor global (admin)** | Menú Admin → **Motor de llamadas** (`/admin/motor-llamadas`) | Superadmin / operaciones Noova | Cuántas llamadas puede hacer **toda la plataforma** a la vez, cada cuánto “echa a andar” el marcador, reintentos globales |
| **B. Campaña del cliente** | Dashboard del cliente → Campaña → pestañas **Programación**, **Audiencia**, **General** | Cliente o admin en nombre del cliente | **Cuántos contactos**, **en qué horario**, **cuántos intentos por persona**, cuándo empieza cada llamada |

**Regla de oro:** el motor global debe estar **encendido** y la campaña debe estar **activa** y **dentro del horario** que el cliente definió. Si falta uno de esos tres, no salen llamadas.

---

## 2. Cómo funciona el sistema (explicación simple)

Imagina una **central telefónica automática**:

```
┌─────────────────────────────────────────────────────────────┐
│  MOTOR GLOBAL (Admin)                                       │
│  • Encendido / apagado                                      │
│  • Máximo de llamadas al mismo tiempo (ej. 10)              │
│  • Cada cuántos minutos intenta colocar más llamadas        │
│  • Cuántas coloca por “ronda”                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAMPAÑA DEL CLIENTE                                        │
│  • Lista de contactos (Excel importado)                     │
│  • Horario: “solo llamar de 9:00 a 13:00”                   │
│  • Regla: “llamar al activar” o “según fecha del Excel”     │
│  • Intentos: 1 por día, 2 por día, etc.                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    Llama a cada número
                           │
                           ▼
              IA captura resultados → CRM
```

### Paso a paso (qué pasa en la práctica)

1. El cliente **importa su Excel** (teléfono obligatorio) y **activa** la campaña.
2. El **motor global**, si está encendido, revisa cada X minutos si hay campañas activas **dentro de horario**.
3. Si hay cupo (por ejemplo 10 llamadas a la vez y solo hay 3 en curso), el sistema **marca** hasta completar el cupo o agotar contactos pendientes.
4. Cada contacto pasa por estados que verás en **Audiencia** / **Resultados**: pendiente → marcando → contestó / buzón / no contestó / etc.
5. Si el contacto **no contestó** y la campaña permite reintentos, vuelve a la cola **después** del tiempo de espera configurado en admin.
6. Al terminar la conversación, la **IA llena los campos** de la campaña y, según el tipo, puede actualizar el CRM.

### Palabras que verás en pantalla

| Término | Significado para el cliente |
|---------|----------------------------|
| **Llamadas simultáneas** | Cuántas personas pueden estar en llamada **al mismo tiempo** en toda la plataforma |
| **Frecuencia del marcador** | Cada cuántos minutos el sistema intenta **lanzar nuevas llamadas** para llenar los cupos libres |
| **Tamaño de lote** | Cuántas llamadas **como máximo** intenta colocar en cada ronda (nunca supera las simultáneas libres) |
| **Timeout de timbrado** | Cuántos segundos suena el teléfono antes de considerar “no contestó” |
| **Espera entre reintentos** | Minutos de pausa antes de volver a llamar a alguien que no contestó |
| **Intentos por día** | Cuántas veces **como máximo** se llama a la misma persona **en un mismo día** |
| **Intentos máximos** | Límite total de intentos por persona en toda la campaña (sumando varios días) |

---

## 3. Límite real: ElevenLabs y la línea telefónica

Antes de elegir números en las tablas:

| Recurso | Qué limita |
|---------|----------|
| **Plan ElevenLabs del cliente** | Llamadas **simultáneas** con IA premium (ej. 10 en paralelo) |
| **Línea Telnyx (+57 u otro)** | Debe estar **activa** y asignada al agente de voz |
| **Créditos Noova** | Facturación interna por minutos de conversación |
| **Motor global → Llamadas simultáneas** | Debe ser **≤** el límite de ElevenLabs (no sirve poner 50 si el plan permite 10) |

**Recomendación:** si el plan ElevenLabs permite **10 simultáneas**, deja **Llamadas simultáneas = 10** en admin salvo que suban el plan.

---

## 4. Tablas de configuración por escenario (Admin + Cliente)

### Supuestos usados en los cálculos

- Agente **premium (ElevenLabs)**.
- Duración media por intento (timbrado + conversación o buzón): **~1,5 a 2,5 minutos**.
- Con **10 simultáneas**, capacidad orientativa: **~250–350 llamadas por hora** si el flujo es continuo.
- Ventana horaria = horas del día en que la campaña **está permitida** llamar (pestaña Programación del cliente).

> **Nota:** Si muchas llamadas van a buzón o son muy cortas, se completan **más** contactos por hora. Si todas son conversaciones largas (3+ min), se completan **menos**.

---

### Escenario A — 50 llamadas en un día

Ideal para: prueba piloto, cliente nuevo, validación de guion.

| Parámetro | Admin (Motor) | Campaña (Cliente) |
|-----------|---------------|-------------------|
| Motor encendido | ✅ Sí | — |
| Llamadas simultáneas | **5** | — |
| Tamaño de lote | **5** | — |
| Frecuencia del marcador | **2** min | — |
| Timeout timbrado | **30** seg | — |
| Espera entre reintentos | **240** min | — |
| Ventana horaria | — | **2 horas** (ej. 10:00–12:00) |
| Intentos por día | — | **1** |
| Intentos máximos | — | **1** |
| ¿Cuándo llamar? | — | **Al activar la campaña** |
| Fecha inicio / fin | — | Solo **hoy** |

**Tiempo estimado para completar:** 30–60 minutos dentro de la ventana.

**Comentario:** No hace falta exprimir el sistema; con 5 simultáneas es suficiente y deja margen si hay otra campaña.

---

### Escenario B — 250 llamadas en un día

Ideal para: campaña comercial mediana, un solo cliente.

| Parámetro | Admin (Motor) | Campaña (Cliente) |
|-----------|---------------|-------------------|
| Motor encendido | ✅ Sí | — |
| Llamadas simultáneas | **10** | — |
| Tamaño de lote | **10** | — |
| Frecuencia del marcador | **1** min | — |
| Timeout timbrado | **30–45** seg | — |
| Espera entre reintentos | **180** min | — |
| Ventana horaria | — | **4 horas** (ej. 09:00–13:00) |
| Intentos por día | — | **1** |
| Intentos máximos | — | **2** (por si quieren reintentar otro día) |
| ¿Cuándo llamar? | — | **Al activar la campaña** |

**Tiempo estimado:** 1,5–2,5 horas de marcado efectivo dentro de la ventana de 4 h.

---

### Escenario C — 500 llamadas en un día

Ideal para: lote comercial agresivo (tu caso típico).

| Parámetro | Admin (Motor) | Campaña (Cliente) |
|-----------|---------------|-------------------|
| Motor encendido | ✅ Sí | — |
| Llamadas simultáneas | **10** | — |
| Tamaño de lote | **10** | — |
| Frecuencia del marcador | **1** min | — |
| Timeout timbrado | **30–45** seg | — |
| Espera entre reintentos | **240** min (4 h) | — |
| Ventana horaria | — | **4–6 horas** (ej. 09:00–13:00 o 08:00–14:00) |
| Intentos por día | — | **1** |
| Intentos máximos | — | **2** |
| ¿Cuándo llamar? | — | **Al activar la campaña** |

**Tiempo estimado:** 2–4 horas de marcado continuo con 10 simultáneas.

**Importante:** `Espera entre reintentos = 240` evita que los “no contestó” vuelvan a entrar el mismo día y te coman cupo.

---

### Escenario D — 1.000 llamadas en un día

Ideal para: operación grande, un cliente con lista amplia.

| Parámetro | Admin (Motor) | Campaña (Cliente) |
|-----------|---------------|-------------------|
| Motor encendido | ✅ Sí | — |
| Llamadas simultáneas | **10** *(o 15–20 si ElevenLabs lo permite)* | — |
| Tamaño de lote | **10–15** | — |
| Frecuencia del marcador | **1** min | — |
| Timeout timbrado | **30** seg | — |
| Espera entre reintentos | **360** min (6 h) | — |
| Ventana horaria | — | **8 horas** (ej. 08:00–16:00) |
| Intentos por día | — | **1** |
| Intentos máximos | — | **2** |
| ¿Cuándo llamar? | — | **Al activar la campaña** |

**Tiempo estimado:** 4–6 horas de operación con 10 simultáneas.

**Si no alcanza la ventana:** subir simultáneas según plan ElevenLabs **o** dividir en 2 días (500 + 500).

---

### Escenario E — 2.000 llamadas en un día

Ideal para: operación masiva (requiere plan ElevenLabs alto y monitoreo).

| Parámetro | Admin (Motor) | Campaña (Cliente) |
|-----------|---------------|-------------------|
| Motor encendido | ✅ Sí | — |
| Llamadas simultáneas | **20** *(mínimo recomendado; depende del plan)* | — |
| Tamaño de lote | **15–20** | — |
| Frecuencia del marcador | **1** min | — |
| Timeout timbrado | **25–30** seg | — |
| Espera entre reintentos | **480** min (8 h) | — |
| Ventana horaria | — | **8–10 horas** (ej. 08:00–18:00) |
| Intentos por día | — | **1** |
| Intentos máximos | — | **2** |
| ¿Cuándo llamar? | — | **Al activar** o **2 campañas** de 1.000 |

**Tiempo estimado con 20 simultáneas:** ~6–8 h.

**Alternativa más segura:** **Dos campañas** de 1.000 contactos (mañana y tarde) o **dos días** de 1.000, en lugar de forzar 2.000 en un solo día con plan de 10 simultáneas (tomaría ~10–12 h).

---

### Tabla resumen rápida

| Objetivo / día | Simultáneas (admin) | Frecuencia marcador | Lote | Ventana cliente | Intentos/día |
|----------------|--------------------|--------------------|------|-----------------|--------------|
| **50** | 5 | 2 min | 5 | 2 h | 1 |
| **250** | 10 | 1 min | 10 | 4 h | 1 |
| **500** | 10 | 1 min | 10 | 4–6 h | 1 |
| **1.000** | 10–20 | 1 min | 10–15 | 8 h | 1 |
| **2.000** | 20+ | 1 min | 15–20 | 8–10 h | 1 |

---

## 5. Configuración del cliente — Programación (pestaña detallada)

Ruta: **Dashboard → Campañas → [nombre] → Programación**

### 5.1 Periodo

| Campo | Qué poner | Explicación |
|-------|-----------|-------------|
| **Fecha de inicio** | Día en que empieza la campaña | Antes de esta fecha el marcador **no llama**, aunque esté activa |
| **Fecha de finalización** | Opcional | Si la pones, después de ese día **deja de llamar** automáticamente |

**Ejemplo 500 llamadas hoy:** inicio = hoy, fin = hoy.

### 5.2 Límites de intentos

| Campo | Recomendación típica | Explicación |
|-------|---------------------|-------------|
| **Intentos máximos** | 1–2 para prospección masiva | Total de veces que se puede llamar a una persona en **toda** la vida de la campaña |
| **Intentos por día** | **1** en lotes grandes | Evita llamar dos veces el mismo día a la misma persona |
| **Huso horario** | `America/Bogota` | Todo el horario se interpreta en hora Colombia |

### 5.3 Horarios por día

Tabla de días con casilla ✅, hora **Inicio** y **Fin**.

| Día | Uso |
|-----|-----|
| Lunes–Viernes ✅ | Días laborales |
| Sábado / Domingo | Desactivar salvo que el cliente lo pida |

**Ejemplo ventana 4 horas:**

| Día | Activo | Inicio | Fin |
|-----|--------|--------|-----|
| Lunes (hoy) | ✅ | 09:00 | 13:00 |
| Resto de días | ❌ | — | — |

Fuera de ese rango verás en la campaña un mensaje tipo *“Fuera de horario”* — **no es error**, es protección legal/comercial.

### 5.4 ¿Cuándo llamar? (regla de disparo)

| Opción | Cuándo usarla |
|--------|---------------|
| **Al activar la campaña** | Listas de prospección: todos entran a la cola al activar (**la más común**) |
| **Según fecha en el Excel** | Recordatorios de cita: “llamar 3 días antes de la columna Fecha” |
| **Fecha y hora fija** | Avisos masivos a la misma hora para todos |

Para lotes de 50–2.000 contactos comerciales: casi siempre **Al activar la campaña**.

---

## 6. Checklist del administrador antes de un lote grande

### Infraestructura

- [ ] Línea Telnyx **activa** (Colombia +57 u otra acordada)
- [ ] Agente de voz **premium** asignado a la línea
- [ ] Línea **sincronizada** con ElevenLabs (sin error en Canales)
- [ ] Plan ElevenLabs con **simultáneas** suficientes
- [ ] Créditos Noova del cliente **suficientes**

### Motor global (`/admin/motor-llamadas`)

- [ ] **Motor encendido** = Sí
- [ ] **Llamadas simultáneas** ≤ límite ElevenLabs
- [ ] **Frecuencia** = 1 min para lotes ≥ 250
- [ ] **Tamaño de lote** = igual o cercano a simultáneas
- [ ] Probar **“Ejecutar ciclo ahora”** y verificar que coloca llamadas

### Campaña del cliente

- [ ] Audiencia importada (conteo correcto: 500, 1.000, etc.)
- [ ] Campos de salida + **tipificación principal** definidos
- [ ] Programación: ventana horaria **cubre** el tiempo necesario
- [ ] Campaña en estado **Activa**
- [ ] Cabecera de la campaña dice **“En horario de llamadas”**

### Durante la operación

- [ ] Revisar **Audiencia** (pending baja)
- [ ] Revisar **Registro** / **Resultados**
- [ ] Si se estanca: Admin → Ejecutar ciclo; verificar simultáneas llenas vs fuera de horario

---

## 7. Problemas frecuentes (sin tocar código)

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| No sale ninguna llamada | Motor global **apagado** | Encender en Motor de llamadas |
| No sale ninguna llamada | Campaña **borrador** o **pausada** | Activar campaña |
| No sale ninguna llamada | **Fuera de horario** | Ampliar ventana en Programación o esperar |
| Muy pocas llamadas por hora | **Frecuencia** muy alta (ej. 20 min) | Bajar a 1–2 min |
| Se detiene con contactos pendientes | **10 simultáneas** ocupadas + conversaciones largas | Normal; esperar o subir plan |
| Misma persona llamada 2 veces hoy | **Intentos por día** > 1 | Dejar en 1 para lotes masivos |
| Buzón cobra créditos | Configuración antigua | Verificar versión con AMD (buzón no debe cobrar premium) |

---

## 8. Fórmula simple para estimar tiempo

Usa esta regla mental:

```
Tiempo (horas) ≈ Total de contactos ÷ (Simultáneas × 30)
```

El **30** es una estimación de “cuántos contactos por hora por línea paralela” con conversaciones mixtas (contestó, buzón, no contestó).

**Ejemplos:**

| Contactos | Simultáneas | Tiempo aprox. |
|-----------|-------------|---------------|
| 500 | 10 | 500 ÷ 300 ≈ **1,7 h** |
| 1.000 | 10 | **~3,3 h** |
| 2.000 | 10 | **~6,7 h** |
| 2.000 | 20 | **~3,3 h** |

Siempre deja **+30 min** de margen por listas lentas, errores de red o números inválidos.

---

## 9. Varias campañas al mismo tiempo

Si **dos clientes** (o dos campañas) están activas a la vez:

- Comparten el mismo **tope de llamadas simultáneas** del admin.
- El sistema reparte cupos entre campañas que estén en horario.
- Para un lote crítico de 500, **evita** tener otra campaña grande activa el mismo día en la misma franja horaria.

---

## 10. Contacto y escalamiento

| Tema | Acción |
|------|--------|
| Línea Telnyx pendiente (documentos) | Portal Telnyx → Orders; datos de empresa exactos |
| ElevenLabs rechaza llamadas | Revisar límite de simultáneas en su dashboard |
| Marcador no corre en producción | Verificar que el servidor esté arriba y motor encendido |
| Dudas de facturación | Revisar créditos del cliente antes del lote |

---

*Documento interno Noova — Motor de campañas v1. Actualizar si cambian los defaults en `/admin/motor-llamadas` o los límites del plan ElevenLabs.*
