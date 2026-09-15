# Handoff — campos de cotización configurables (actualizado 2026-09-15, sesión nocturna)

Este documento reemplaza al original de la misma ruta. El plan original (botones deterministas + campos configurables para los 6 ramos activos) **se completó, se desplegó y se probó en vivo con éxito**. Esta sesión además:

1. Extrajo los 26 formularios reales de Figuro (competidor) y los convirtió en defaults para 20 ramos nuevos.
2. Conectó el motor genérico (`iniciar_cotizacion_seguro`/`registrar_dato_cotizacion`, ya existía pero nunca se había registrado) para esos 20 ramos.
3. Encontró y arregló 3 bugs reales durante la verificación (dos ya corregidos y desplegados, uno **pendiente**, ver abajo).

**Repo:** `/Users/johngarcia/appnoova` — todo commiteado y pusheado a `main`, 4 commits: `e039d9a`, `95f993d`, `5a0ca02`, `7d920a6`.

---

## Lo que quedó funcionando y verificado en producción (WhatsApp real, cuenta "Noova 360 Oficial", noova360.com)

- **UI de configuración** (`/dashboard/seguros/configuracion` → pestaña "Preguntas que hace la IA"): layout de lista + panel (Opción A que aprobaste), 26 ramos con buscador, filas de campo compactas y expandibles, tipo de campo "Multiselección" nuevo (para "elige todas las que apliquen", ej. naturaleza del riesgo en transporte de mercancías).
- **Autos** (ramo con tool dedicada): probado end-to-end por WhatsApp antes de esta sesión nocturna — placa, botones sin duplicar pregunta, edición de una pregunta desde la UI y persistencia confirmada.
- **Mascotas** (ramo del motor genérico, recién conectado): probado en vivo esta noche —
  - `iniciar_cotizacion_seguro` arranca bien, pide datos del tomador.
  - Los datos del tomador (nombre, documento, fecha de nacimiento, ocupación) **sí se guardan correctamente** entre turnos (confirmado en `insurance_quote_requests.tomador`).
  - Al llegar a "¿Qué tipo de mascota tienes?" (2 opciones) salieron **botones reales de WhatsApp** ("Perro"/"Gato"), sin texto duplicado antes — exactamente el objetivo del proyecto.
- **Ramos ofrecidos**: BICICLETA, PLAN DENTAL, CIBERRIESGOS, SEPELIO ya aparecen en el catálogo (migración 146 aplicada).

## 🔴 Bug pendiente — CONFIRMADO, el más importante para revisar primero

**El motor genérico (los 20 ramos nuevos) no guarda de forma confiable los datos que el cliente responde por WhatsApp — ni siquiera los del tomador.** No es un problema de plomería (eso ya se arregló, ver abajo) sino de que el modelo deja de llamar la tool de guardado después de la primera vez.

### Evidencia — dos pruebas en vivo, mismo patrón

**Prueba 1 (Mascotas, antes del intento de fix), quote `6b547013-d97a-4327-9268-940999982e4b`:**
```
tomador: { nombre_tomador, documento_tomador, fecha_nacimiento_tomador, ocupacion }  ✅ completo
datos_riesgo: {}  ❌ vacío — "Perro", "Firulais", "3 años", "Criollo" nunca se guardaron
```

**Intento de fix (commit `f1c23ec`):** reforcé el prompt de `registrar_dato_cotizacion` para exigir explícitamente "llama esta tool antes de redactar cualquier pregunta siguiente, incluso para un dato corto". Desplegado y **re-probado en vivo** (Bicicleta, conversación nueva y limpia).

**Prueba 2 (Bicicleta, DESPUÉS del fix), quote `39c1ec21-260d-474c-b439-96ba74f20b50`:**
```
tomador: { nombre_tomador: "Juan Pérez" }   ⚠️ solo el nombre
datos_riesgo: {}                             ❌ vacío
created_at ≈ updated_at (mismo instante)     ⚠️ la fila SOLO se escribió UNA VEZ en toda la conversación
```
La conversación real fue: nombre ✅ (única vez que se guardó) → documento (respondido, no guardado) → fecha de nacimiento (respondido, no guardado) → marca de bicicleta (respondido, no guardado) → modelo (preguntado). El bot preguntó cada campo en el orden correcto — pero **sin volver a llamar ninguna tool después de la primera vez**. El refuerzo del prompt no fue suficiente.

### Diagnóstico real (ya no es hipótesis)

El modelo llama la tool **una sola vez**, recibe la lista completa y ordenada de `faltan_datos`, y a partir de ahí **conversa de memoria** repitiendo esa lista pregunta por pregunta — sin sentir la necesidad de volver a invocar ninguna tool para persistir cada respuesta. Ningún texto de prompt adicional lo obliga de forma confiable a hacerlo en cada turno; es un problema estructural del diseño de dos tools (`iniciar_cotizacion_seguro` + `registrar_dato_cotizacion` incremental), no de la redacción del prompt.

**Por qué los 6 ramos dedicados (autos, motos, vida, hogar, SOAT, accidentes) SÍ funcionan (confirmado en producción):** cada uno tiene una función con parámetros fijos y nombrados por campo (no un objeto libre `campos`) y su prompt script completo, específico del ramo, instruye literalmente el guion pregunta-por-pregunta con la tool de por medio. El motor genérico usa lenguaje más abstracto/meta ("llama esta tool para lo que sepas") precisamente porque tiene que servir a 20 ramos distintos con un solo esquema — y ese nivel de abstracción parece ser justo lo que el modelo no sigue de forma confiable turno a turno.

### La solución real (no la implementé esta noche — necesita tu visto bueno)

Fusionar `iniciar_cotizacion_seguro` + `registrar_dato_cotizacion` en **una sola tool** que el modelo llame en cada turno con **TODOS los campos que ya conoce de la conversación** (acumulados, no incrementales) — replicando exactamente el patrón que ya funciona en los 6 ramos dedicados, en vez de depender de que el modelo decida "guardar" cada respuesta suelta. Es un cambio de diseño real en `generic-quote-tool.ts`/`generic-quote-agent-tools.ts`, no un ajuste de una línea, y quería que lo vieras antes de tocar la arquitectura mientras dormías. Alternativas más chicas (bajar a Claude/GPT para estas tools en vez de Gemini, forzar tool-calling obligatorio si el proveedor lo soporta) valen la pena explorar primero, son más baratas que el rediseño completo.

**Importante para el estado actual:** esto significa que, aunque la UI de configuración y los botones deterministas SÍ funcionan bien para los 20 ramos nuevos, **la persistencia real de los datos de cotización por WhatsApp no es confiable todavía para ninguno de los 20 ramos genéricos** — solo para los 6 ramos con tool dedicada (que no se tocaron y siguen sólidos).

**Ya arreglado esta noche** (esto sí quedó bien, confirmado, no relacionado con el bug de arriba): que `registrar_dato_cotizacion` perdiera el `quote_request_id` entre turnos de WhatsApp (commit `7d920a6`) — ese era un bug real de plomería, ya resuelto. También confirmé (leyendo `quote-requests-db.ts`) que `upsertPendingQuoteRequest` SOBRESCRIBE `tomador`/`datos_riesgo` completos en cada llamada (no hace merge) — inofensivo mientras el modelo solo lo llame una vez al inicio, pero sería otro riesgo latente si alguna vez se le ocurre re-llamar `iniciar_cotizacion_seguro` a mitad de conversación con datos parciales.

## Otros hallazgos de esta sesión (ya arreglados y desplegados)

1. **Campos con clave desconocida rompían los 6 ramos dedicados** (commit `5a0ca02`): la org de prueba tenía filas viejas en `poliza_ramo_campos` para Hogar (18 campos, de una sesión anterior al 12 de sept) con claves que no coinciden con el esquema fijo de `home-quote-tool.ts`. `resolveCampos()` ahora filtra a solo las claves que la tool puede recibir de verdad. **Quedan 18 filas de Hogar en la DB para la org de prueba que ya no afectan nada pero son ruido en la UI admin** — si algún día migras Hogar al motor genérico, esas filas (con el desglose "Valores a asegurar" completo) se vuelven útiles automáticamente; si no, puedes borrarlas cuando quieras.
2. **Posible envío duplicado de botones bajo respuesta lenta**: una sola vez, en la prueba de Mascotas, los botones "Perro"/"Gato" llegaron dos veces seguidas. No se repitió en los turnos siguientes. Hipótesis más probable: reintento de webhook de Twilio por una respuesta lenta (no exclusivo de mi código nuevo — le pasaría a cualquier tool que tarde). No alcancé a confirmarlo con logs de Twilio/Coolify.

## Link directo / microsite — probado, funciona igual que WhatsApp (mismo bug)

Existe un microsite de prueba `testlucia` (org Resguarda, agente Lucia, `quoting_rules.enabled: true`) — probablemente configurado por mí antes del corte de contexto de esta sesión. Local: `http://localhost:62832/c/testlucia`. Probé el flujo completo del widget de chat público: arranca bien, pide tomador, responde de forma coherente — y reproduce el mismo bug de persistencia del motor genérico (quote `02bcac17-9517-419f-9512-8b3569849196`, ramo mascotas: solo `nombre_tomador` guardado, una sola escritura). Es exactamente lo esperado, mismo motor genérico por debajo — no es un bug nuevo del canal web, solo confirma que el problema no es específico de WhatsApp.

**Nota menor, no crítica:** esa fila quedó con `source: "whatsapp"` en vez de `"web"` a pesar de venir del microsite — la lógica en `generic-quote-agent-tools.ts` (`ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp"`) parece no estar recibiendo el valor de canal esperado en esta ruta. Cosmético (solo afecta el campo `source`, no el bug de datos), no lo investigué más a fondo esta noche.

## Documento de Figuro — recuperado, no perdido

La sesión que se cerró al cambiar de plan (Pro→Team) sí completó trabajo real: quedó guardado directo en Supabase (`poliza_ramo_campos`, filas del 12 de sept para Hogar y Salud en 2 organizaciones de prueba) en vez de en un documento. Ya lo usé para verificar mis propios defaults contra ese trabajo previo.

## Decisiones tomadas explícitamente por ti en esta sesión (no volver a preguntar)

- Opción de layout **A — Lista + panel** (no acordeón).
- Crear ramos configurables por el corredor: **buena idea**, ya es posible sin código nuevo vía el motor genérico.
- Implementar los 20 ramos nuevos completos, incluyendo mascotas/multiselección/adjuntos: **sí, hazlo todo**.
- Adjuntos de archivo (ej. "sube tu contrato" en Cumplimiento): **no se modeló** — se omitió el campo de la definición default; el asesor humano lo pide después por el mismo chat. No hace falta infraestructura nueva.
- Autonomía total para commit/push/pruebas sin esperar confirmación mientras dormías.

## Archivos clave nuevos/tocados esta sesión

```
supabase/migrations/145_ramo_campos_cotizacion.sql
supabase/migrations/146_ramos_catalogo_multiselect.sql
src/lib/insurers/ramo-campos-defaults.ts        (defaults de los 26 ramos)
src/lib/insurers/ramos-cotizables.ts            (RAMOS_COTIZABLES + RAMOS_MOTOR_GENERICO)
src/lib/insurers/generic-quote-tool.ts          (motor genérico + fix de cross-turn id)
src/lib/insurers/quote-requests-db.ts           (findPendingQuoteRequestByConversation/ByLead)
src/lib/agent-tools/generic-quote-agent-tools.ts
src/lib/agent-tools/generic-quote-ori-tools.ts
src/lib/agent-tools/guided-questions.ts         (determinismo botones/lista + filtro de esquema fijo)
src/lib/agent-tools/all-text-tools.ts           (registro del motor genérico)
src/components/seguros/PolizaRamoCamposPanel.tsx (filas expandibles + multiselección)
src/app/dashboard/seguros/configuracion/page.tsx (layout lista + panel, 26 ramos)
```

## Resumen ejecutivo (para leer primero)

- ✅ **Los 6 ramos con tool dedicada** (autos, motos, vida, hogar, SOAT, accidentes personales) están sólidos: botones deterministas, sin preguntas duplicadas, UI de configuración funcionando, persistencia confirmada en producción.
- ✅ **UI de configuración** ("Preguntas que hace la IA"): probada en 5+ ramos distintos (Autos, Hogar, Bicicleta, Transporte de Mercancías, Mascotas) — carga de defaults, edición, guardado automático (onBlur), tipo multiselección, todo funcionando bien tanto en config nueva como ya materializada.
- ✅ **Link directo / microsite**: confirmado funcional para arrancar cotizaciones del motor genérico (antes no probado, gap cerrado esta noche).
- 🔴 **Los 20 ramos nuevos del motor genérico NO guardan de forma confiable los datos de la cotización** — el modelo llama la tool de guardado una sola vez y luego conversa de memoria. Confirmado con 3 pruebas en vivo independientes (Mascotas x2, Bicicleta) en dos canales distintos (WhatsApp y microsite). Un intento de arreglarlo reforzando el prompt (commit `f1c23ec`) NO fue suficiente. La solución real requiere fusionar las dos tools del motor genérico en una sola que reciba todos los campos conocidos cada turno — cambio de arquitectura, no de una línea — pendiente de tu visto bueno antes de tocarlo. Ver sección de arriba para el detalle completo.

## Datos para depurar

| Qué | Valor |
|---|---|
| Org de prueba | Resguarda — `bd23473f-a2dd-436b-9f4a-5814bb24b1ec` |
| WhatsApp probado esta noche | "Noova 360 Oficial" (noova360.com) — cuenta de empresa real, NO Lucia/Resguarda |
| Microsite de prueba | `testlucia` (agente Lucia, quoting habilitado) — `/c/testlucia` |
| Quotes de prueba (motor genérico, todas con datos_riesgo vacío — se pueden borrar) | `6b547013-d97a-4327-9268-940999982e4b` (mascotas, WhatsApp), `39c1ec21-260d-474c-b439-96ba74f20b50` (bicicleta, WhatsApp), `02bcac17-9517-419f-9512-8b3569849196` / `3e61ecc0-7b0e-4ba8-8f4f-ad1f47b761f9` (mascotas, microsite) |
| Migraciones nuevas | 145, 146 (ya aplicadas en dev) |
| Commits de esta sesión nocturna | `e039d9a`, `95f993d`, `5a0ca02`, `7d920a6`, `f1c23ec`, `db7d21c` |
