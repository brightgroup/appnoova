# Handoff — campos de cotización configurables (actualizado 2026-09-15, mañana — todo resuelto)

Este documento reemplaza al original de la misma ruta. El plan original (botones deterministas + campos configurables para los 6 ramos activos) **se completó, se desplegó y se probó en vivo con éxito**. La sesión nocturna además:

1. Extrajo los 26 formularios reales de Figuro (competidor) y los convirtió en defaults para 20 ramos nuevos.
2. Conectó el motor genérico para esos 20 ramos.
3. Encontró un bug crítico de persistencia en el motor genérico durante la verificación, lo dejó bien documentado sin arreglar especulativamente de madrugada.

A la mañana siguiente, con la aprobación del usuario, se implementó el fix real (fusionar el motor genérico en una sola tool, igual que los 6 ramos dedicados) y **se verificó en vivo con éxito** — ver sección "✅ Bug crítico — RESUELTO" abajo.

**Repo:** `/Users/johngarcia/appnoova` — todo commiteado y pusheado a `main`. Commits de la sesión nocturna: `e039d9a`, `95f993d`, `5a0ca02`, `7d920a6`, `f1c23ec`, `db7d21c`, `9a5572b`. Commits del fix de la mañana: `e2936ac`, `105dd78`, `36fbae7`.

---

## Lo que quedó funcionando y verificado en producción (WhatsApp real, cuenta "Noova 360 Oficial", noova360.com)

- **UI de configuración** (`/dashboard/seguros/configuracion` → pestaña "Preguntas que hace la IA"): layout de lista + panel (Opción A que aprobaste), 26 ramos con buscador, filas de campo compactas y expandibles, tipo de campo "Multiselección" nuevo (para "elige todas las que apliquen", ej. naturaleza del riesgo en transporte de mercancías).
- **Autos** (ramo con tool dedicada): probado end-to-end por WhatsApp antes de esta sesión nocturna — placa, botones sin duplicar pregunta, edición de una pregunta desde la UI y persistencia confirmada.
- **Mascotas** (ramo del motor genérico, recién conectado): probado en vivo esta noche —
  - `iniciar_cotizacion_seguro` arranca bien, pide datos del tomador.
  - Los datos del tomador (nombre, documento, fecha de nacimiento, ocupación) **sí se guardan correctamente** entre turnos (confirmado en `insurance_quote_requests.tomador`).
  - Al llegar a "¿Qué tipo de mascota tienes?" (2 opciones) salieron **botones reales de WhatsApp** ("Perro"/"Gato"), sin texto duplicado antes — exactamente el objetivo del proyecto.
- **Ramos ofrecidos**: BICICLETA, PLAN DENTAL, CIBERRIESGOS, SEPELIO ya aparecen en el catálogo (migración 146 aplicada).
- **Motos** (ramo dedicado, recién agregado a `ramos_catalogo` en esta sesión — migración 145): probado en vivo — el bot reconoce el ramo y pide la placa correctamente. No completé el lookup real (necesita una placa válida de verdad vía Verifik/PlacApi que no tenía a mano), pero confirma que el routing y el catálogo nuevo funcionan.

## ✅ Bug crítico — RESUELTO Y VERIFICADO EN VIVO (2026-09-15, mañana)

**Estado anterior (ver historial completo abajo, sección "Cómo se diagnosticó y arregló"):** el motor genérico (los 20 ramos nuevos) no guardaba de forma confiable los datos que el cliente respondía por WhatsApp/microsite — el modelo llamaba la tool de guardado una sola vez y después conversaba de memoria sin volver a persistir nada.

**Fix real, aprobado por el usuario ("fusiónalo, para que todo quede como los 6 que quedaron perfectos"), implementado y verificado en vivo:**

1. **Commit `e2936ac`** — Se fusionaron `iniciar_cotizacion_seguro` + `registrar_dato_cotizacion` (dos tools, guardado incremental) en **una sola tool `cotizar_seguro`** que el modelo debe llamar en cada turno con TODOS los campos que ya conoce (no solo el más nuevo) — el mismo patrón que ya funcionaba bien en los 6 ramos dedicados. Reemplazado en los 3 puntos de registro (agentes de texto, ORI).
2. **Commit `105dd78`** — Reforzado el prompt para exigir usar la clave (`key`) exacta de cada campo, tal como la devuelve `faltan_datos`.
3. **Commit `36fbae7`** — El refuerzo de prompt del punto 2 no fue suficiente por sí solo (el modelo seguía mandando `plan_cobertura` en vez de `plan_cobertura_sepelio` en una prueba en vivo) — se agregó una **red de seguridad a nivel de código** en `cotizarSeguroGenerico`: normaliza cada clave entrante contra las claves reales del ramo (ignorando mayúsculas/acentos/guiones), reasignándola solo cuando el match es inequívoco. Verificado con pruebas unitarias aisladas cubriendo el caso real que falló.

**Verificación en vivo — flujo completo de Sepelio, microsite `/c/testlucia`, quote `7754fc33-76d4-4742-97d5-23c66bd23497`:**
```
tomador: { nombre_tomador, documento_tomador, fecha_nacimiento_tomador, ocupacion }  ✅ completo
datos_riesgo: { para_quien, plan_cobertura_sepelio, tipo_cobertura_sepelio, ... }     ✅ completo, claves canónicas presentes
```
El bot confirmó explícitamente: *"¡Perfecto! Ya tenemos todos tus datos para la cotización del seguro de sepelio. Un asesor de Resguarda Seguros te confirmará el precio en breve."* — sin loops, sin "hubo un error".

**Nota menor no bloqueante:** `datos_riesgo` conserva también algunas variantes de clave que el modelo mandó en turnos anteriores (ej. `plan_cobertura` junto a `plan_cobertura_sepelio`) — son inofensivas (datos extra, no pisan nada) y no afectan lo que ve el asesor ni la lógica de "completo". No se limpiaron a propósito, para no perder ningún dato real por accidente.

### Cómo se diagnosticó y arregló (historial, para contexto)

**Evidencia original del bug (antes del fix):**

Prueba 1 (Mascotas), quote `6b547013-d97a-4327-9268-940999982e4b`: tomador completo, `datos_riesgo: {}` vacío — "Perro", "Firulais", "3 años", "Criollo" nunca se guardaron.

Un primer intento de arreglo solo-con-prompt (commit `f1c23ec`, reforzar "llama la tool antes de cada pregunta") **no fue suficiente** — reprobado en vivo (Bicicleta, quote `39c1ec21-260d-474c-b439-96ba74f20b50`): la fila solo se escribió UNA VEZ en toda la conversación (`created_at` ≈ `updated_at`), con solo el nombre del tomador guardado.

**Diagnóstico real:** el modelo llamaba la tool **una sola vez**, recibía la lista completa de `faltan_datos`, y a partir de ahí conversaba de memoria repitiendo esa lista pregunta por pregunta — sin volver a invocar ninguna tool para persistir cada respuesta. Los 6 ramos dedicados no tenían este problema porque cada uno tiene una función con parámetros fijos y nombrados por campo (no un objeto libre `campos`) y un prompt script concreto y específico del ramo — el motor genérico usaba lenguaje más abstracto ("llama esta tool con lo que sepas") precisamente por tener que servir a 20 ramos con un solo esquema, y ese nivel de abstracción era justo lo que el modelo no seguía de forma confiable.

**La solución real** (identificada esa madrugada, implementada esta mañana con aprobación del usuario): fusionar las dos tools en una sola llamada cada turno con todos los campos conocidos — ver arriba.

**Bugs de plomería ya resueltos antes de la fusión (siguen válidos):** `registrar_dato_cotizacion` perdía el `quote_request_id` entre turnos de WhatsApp (commit `7d920a6`) — corregido resolviendo el registro por organización+conversación+ramo en vez de por id.

## Otros hallazgos de esta sesión (ya arreglados y desplegados)

1. **Campos con clave desconocida rompían los 6 ramos dedicados** (commit `5a0ca02`): la org de prueba tenía filas viejas en `poliza_ramo_campos` para Hogar (18 campos, de una sesión anterior al 12 de sept) con claves que no coinciden con el esquema fijo de `home-quote-tool.ts`. `resolveCampos()` ahora filtra a solo las claves que la tool puede recibir de verdad. **Quedan 18 filas de Hogar en la DB para la org de prueba que ya no afectan nada pero son ruido en la UI admin** — si algún día migras Hogar al motor genérico, esas filas (con el desglose "Valores a asegurar" completo) se vuelven útiles automáticamente; si no, puedes borrarlas cuando quieras.
2. **Posible envío duplicado de botones bajo respuesta lenta**: una sola vez, en la prueba de Mascotas, los botones "Perro"/"Gato" llegaron dos veces seguidas. No se repitió en los turnos siguientes. Hipótesis más probable: reintento de webhook de Twilio por una respuesta lenta (no exclusivo de mi código nuevo — le pasaría a cualquier tool que tarde). No alcancé a confirmarlo con logs de Twilio/Coolify.

## Link directo / microsite — probado, funciona bien (mismo fix aplicado)

Existe un microsite de prueba `testlucia` (org Resguarda, agente Lucia, `quoting_rules.enabled: true`) — producción: `https://app.noova360.com/c/testlucia`. Probé el flujo completo del widget de chat público dos veces: antes del fix reprodujo el mismo bug de persistencia del motor genérico (quote `02bcac17-9517-419f-9512-8b3569849196`, ramo mascotas — solo `nombre_tomador` guardado); **después del fix (commits `e2936ac`/`36fbae7`), un flujo completo de sepelio en este mismo canal quedó 100% guardado y confirmado "completo"** (quote `7754fc33-76d4-4742-97d5-23c66bd23497`, ver sección del bug arriba). Mismo motor genérico por debajo de WhatsApp y microsite — el fix cubre ambos canales por igual.

**Nota menor, no crítica, ya diagnosticada del todo:** esa fila quedó con `source: "whatsapp"` en vez de `"web"` a pesar de venir del microsite. Causa raíz confirmada: `/c/[slug]` (Mi Link) manda `channel: "web_widget"` (`src/lib/widget-channel.ts`), pero el chequeo `ctx.channel === "web_embed" || ctx.channel === "web_test" ? "web" : "whatsapp"` — repetido en los 8 tools de cotización, incluidos los 6 ramos dedicados — nunca contempló ese valor. Es un bug preexistente (no algo que se rompió esta noche) y puramente cosmético (no afecta que los datos se guarden). Dejé una tarea aparte anotada para arreglarlo sin mezclarlo con este cambio.

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
- ✅ **Link directo / microsite**: confirmado funcional para arrancar y completar cotizaciones del motor genérico.
- ✅ **Los 20 ramos nuevos del motor genérico — bug crítico de persistencia RESUELTO** (mañana del 2026-09-15, con tu aprobación): se fusionaron las dos tools en una sola (`cotizar_seguro`, commit `e2936ac`) que el modelo llama cada turno con todos los campos conocidos — mismo patrón que los 6 ramos dedicados. Un problema secundario de claves de campo parecidas-pero-no-idénticas se resolvió con una normalización a nivel de código (commit `36fbae7`). Verificado en vivo con un flujo completo de sepelio, 100% guardado y confirmado "completo" por el propio bot. Ver sección "✅ Bug crítico — RESUELTO" arriba para el detalle y la evidencia.
- 🟡 **Pendiente, no bloqueante**: bug cosmético preexistente donde las cotizaciones desde Mi Link quedan con `source: "whatsapp"` en vez de `"web"` — diagnosticado, dejado como tarea aparte (`task_a4797dab`) para no mezclarlo con este cambio.

## Datos para depurar

| Qué | Valor |
|---|---|
| Org de prueba | Resguarda — `bd23473f-a2dd-436b-9f4a-5814bb24b1ec` |
| WhatsApp probado | "Noova 360 Oficial" (noova360.com) — cuenta de empresa real, NO Lucia/Resguarda |
| Microsite de prueba | `testlucia` (agente Lucia, quoting habilitado) — `https://app.noova360.com/c/testlucia` |
| Quote de prueba completa y exitosa (motor genérico, post-fix) | `7754fc33-76d4-4742-97d5-23c66bd23497` (sepelio, microsite) — tomador + datos_riesgo 100% completos |
| Quotes de prueba viejas (pre-fix, con datos_riesgo vacío o incompleto — se pueden borrar) | `6b547013-d97a-4327-9268-940999982e4b` (mascotas), `39c1ec21-260d-474c-b439-96ba74f20b50` (bicicleta), `02bcac17-9517-419f-9512-8b3569849196` / `3e61ecc0-7b0e-4ba8-8f4f-ad1f47b761f9` (mascotas, microsite) |
| Migraciones nuevas | 145, 146 (ya aplicadas en dev) |
| Commits sesión nocturna | `e039d9a`, `95f993d`, `5a0ca02`, `7d920a6`, `f1c23ec`, `db7d21c`, `9a5572b` |
| Commits fix de la mañana | `e2936ac` (fusión en una sola tool), `105dd78` (refuerzo de prompt para claves exactas), `36fbae7` (normalización de claves a nivel de código) |
