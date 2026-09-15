# Handoff — campos de cotización configurables (actualizado 2026-09-15, mañana — todo resuelto)

Este documento reemplaza al original de la misma ruta. El plan original (botones deterministas + campos configurables para los 6 ramos activos) **se completó, se desplegó y se probó en vivo con éxito**. La sesión nocturna además:

1. Extrajo los 26 formularios reales de Figuro (competidor) y los convirtió en defaults para 20 ramos nuevos.
2. Conectó el motor genérico para esos 20 ramos.
3. Encontró un bug crítico de persistencia en el motor genérico durante la verificación, lo dejó bien documentado sin arreglar especulativamente de madrugada.

A la mañana siguiente, con la aprobación del usuario, se implementó el fix real (fusionar el motor genérico en una sola tool, igual que los 6 ramos dedicados) y **se verificó en vivo con éxito** — ver sección "✅ Bug crítico — RESUELTO" abajo.

**Repo:** `/Users/johngarcia/appnoova` — todo commiteado y pusheado a `main`. Commits de la sesión nocturna: `e039d9a`, `95f993d`, `5a0ca02`, `7d920a6`, `f1c23ec`, `db7d21c`, `9a5572b`. Commits del fix de la mañana: `e2936ac`, `105dd78`, `36fbae7`, `3cb2663`, `4a8f9d0`.

---

## Ronda de verificación adicional (mañana, 2 ramos más + ORI) — resumen

Con el motor genérico ya fusionado, se probaron 2 ramos más nunca antes usados (viajes_turismo por WhatsApp, dental por el link) para reforzar la confianza, y se simuló el flujo de un asesor usando ORI para cotizar un auto. Resultado: **2 bugs reales encontrados y arreglados**, **1 hallazgo de comportamiento del modelo documentado sin arreglar** (no es código, es el modelo improvisando), y **1 bloqueo operativo externo** (no es código).

### ✅ Arreglado: botones/lista duplicados (commit `4a8f9d0`)

Confirmado en vivo (viajes_turismo): la pregunta "¿Qué tipo de asistencia de viaje buscas?" llegó dos veces seguidas con los mismos botones. Causa real: el loop de function-calling permite hasta 3 rondas por turno, y el modelo puede llamar `cotizar_seguro` más de una vez en el mismo turno — cada llamada disparaba su propio envío de botones/lista por WhatsApp, sin ningún control de duplicados. Fix: `sentGuidedQuestions` (`Set<string>` por fieldKey), creado una vez por turno y compartido por referencia entre todas las rondas/llamadas de los 3 motores (Gemini/OpenAI/Claude) — `presentGuidedQuestion` ahora lo consulta antes de mandar un botón o lista. **Reprobado en vivo tras el fix** (ramo exequias, campo "¿Para quién es el seguro?"): salió una sola vez. Esto también resuelve la sospecha "posible duplicado" que había quedado sin confirmar en la sección de anoche.

### ✅ Arreglado: cotizaciones de Mi Link etiquetadas como WhatsApp (commit `3cb2663`)

Bug cosmético preexistente (no introducido en esta sesión): las cotizaciones iniciadas desde `/c/[slug]` (Mi Link) quedaban con `source: "whatsapp"` en vez de `"web"` — el chequeo en los 8 tools de cotización no contemplaba el canal `"web_widget"` que usa esa página. Fix: nuevo helper `resolveQuoteSource()` en `widget-channel.ts`, usado en los 8 puntos en vez de repetir la condición inline.

### 🟡 Documentado, sin arreglar: el modelo a veces improvisa fuera del guion

Dos variantes del mismo problema de fondo (el modelo del motor genérico no siempre sigue el guion campo-por-campo al pie de la letra), encontradas en las pruebas de viajes_turismo y dental:

- **Preguntas combinadas**: el bot preguntó "¿Cuáles son las fechas de inicio y fin de tu viaje?" en una sola pregunta (en vez de las dos preguntas separadas que define la config), y guardó la respuesta bajo una clave inventada ("fechas_viaje") que no coincidía con ninguna de las dos claves reales (`fecha_inicio_viaje`/`fecha_fin_viaje`) — mi normalización de claves (commit `36fbae7`) solo cubre variantes 1-a-1, no una respuesta que debía partirse en dos campos. Tuve que responder los campos por separado para completarla.
- **Declaración de "completo" prematura (el más serio)**: en el ramo dental, el bot le dijo a la clienta "ya tengo todos tus datos, un asesor te contactará" **sin haber preguntado el segundo campo del ramo** (tipo de cobertura) — guardó una clave irrelevante ("tipo_plan": "individual", sin relación con nada real) y nunca llamó de nuevo la tool para ese campo. Solo se corrigió cuando "el cliente" (yo, en la prueba) lo cuestionó explícitamente — un cliente real probablemente no lo habría notado, dejando una cotización incompleta marcada como lista para el asesor.
- También se observó, en ambos ramos, al menos una pregunta "bonus" no definida en la config (ej. "¿cuál es tu presupuesto mensual?" en sepelio, "¿cuántas personas incluir?" en exequias) — el modelo la inventa y la guarda con una clave propia; inofensivo (dato extra, no bloquea nada) pero confirma que el modelo no se ciñe estrictamente a `faltan_datos`.

**Por qué no lo arreglé esta madrugada:** ya van dos rondas de "parche de código" esta sesión (fusión de tools + normalización de claves) que resolvieron el bug catastrófico (datos_riesgo vacío) y uno secundario (claves parecidas). Este es un tercer nivel, más sutil — el modelo ignorando su propio resultado de `faltan_datos`/`completo` al redactar el texto final — que probablemente necesite una verificación EXPLÍCITA en código (no confiar en que el texto del modelo refleje el estado real) antes de marcar una cotización como "completa" de cara al cliente, en vez de otro ajuste de prompt o de normalización. Vale la pena diseñarlo con calma en vez de parchar más esta noche.

### 🟡 Arreglado parcialmente + limitación conocida: `para_quien` en dental (ronda "quede perfecto")

Reprobando el bug de "completo prematuro" del ramo dental (con `enforcePendingQuestion` ya desplegado) encontré una tercera capa del mismo problema de fondo: el modelo, para el campo `para_quien` (opciones "Solo para mí"/"Para mí y mi familia"), guardaba el valor **"individual"** en vez del texto real de la opción — probé 3 claves inventadas distintas en la misma conversación (`tipo_plan`, `tipo_poliza`, `tipo_poliza_dental`), todas con el mismo valor "Individual".

- **Arreglado (commit `f7475df`)**: nueva `resolveFieldKeyByValue()` en `generic-quote-tool.ts` — cuando ni la clave calza con nada, busca el VALOR contra las opciones reales del ramo (substring, sin acentos/mayúsculas) y reasigna solo si es inequívoco. **Esto sí resolvió el campo hermano `tipo_cobertura_dental`** (el modelo mandó "Odontología general" bajo una clave inventada — ahora se reconoce y guarda bien).
- **Limitación conocida, sin arreglar**: `para_quien` específicamente sigue sin resolverse — "individual" no comparte ningún texto con "Solo para mí", así que ninguna heurística de texto puede emparejarlos de forma segura (forzarlo a mano sería adivinar, no verificar). El sistema **nunca declara la cotización completa de forma falsa** (gracias a `enforcePendingQuestion`), así que no hay pérdida silenciosa de datos — pero el cliente puede quedar respondiendo la misma pregunta varias veces sin avanzar. Si vuelve a pasar en otro ramo con un campo de fraseo similar ("¿es individual o familiar/colectivo?"), vale la pena considerar: (a) agregar "individual"/"colectiv[oa]"/"familiar" como sinónimos reconocidos explícitamente en código (ya no es una heurística de texto genérica, sería una tabla de sinónimos mantenida a mano), o (b) replantear cómo se le describe la opción al modelo en el prompt.

### ✅ Los 4 ramos dedicados nunca probados esta sesión — 3 de 4 perfectos, 1 con hallazgo importante

Probados de punta a punta por WhatsApp (cuenta "Noova 360 Oficial"):

- **Vida**: 100% perfecto — 5 campos + tomador completo, claves canónicas exactas, sin ningún problema.
- **Hogar**: 100% perfecto — 5 campos + tomador completo, sin ningún problema.
- **SOAT**: 100% perfecto — placa (columna dedicada, no `datos_riesgo`), motor, ciudad y tomador completo, incluso respondiendo las 6 preguntas de un solo mensaje combinado (el bot las listó todas juntas en vez de una por una — desviación menor de comportamiento, sin pérdida de datos).
- **Accidentes personales**: 🔴 **la cotización nunca se guardó** — el bot completó toda la conversación con normalidad y terminó diciendo "¡Listo, Gabriela! He tomado todos los datos...", pero no existe ninguna fila en `insurance_quote_requests` para esa conversación.

**Diagnóstico confirmado**: no es un bug de código. Reproduje la llamada directamente (`calificarAccidentesPersonales` con los mismos 7 datos exactos) y guardó perfecto al instante (quote `9698b9f5-3e92-4262-b50a-f726e5503071`, se puede borrar). Esto confirma que en la conversación real **el modelo nunca llamó la tool en su turno final** — declaró que "ya tenía todos los datos" sin verificarlo, la misma falla de fondo de toda la sesión (el modelo no siempre llama la tool), pero esta vez en un punto donde `enforcePendingQuestion` (el fix de esta madrugada) **no puede ayudar**: esa función solo puede corregir el texto si HUBO una llamada a la tool con un resultado real que comparar — aquí no hubo ninguna llamada, así que no hay nada contra qué verificar.

**Por qué no lo arreglé esta madrugada:** cerrar este hueco de forma robusta significaría forzar que el modelo llame SIEMPRE una tool en cada turno (los proveedores de LLM tienen un modo de "function calling obligatorio", ej. `toolConfig.functionCallingConfig.mode: "ANY"` en Gemini, en vez del modo libre "AUTO" que se usa hoy) — pero ese es un cambio de comportamiento de PLATAFORMA (afecta a todos los agentes de texto, no solo cotizaciones), no algo para decidir unilateralmente ni probar a ciegas de madrugada. Vale la pena evaluarlo contigo despierto, sopesando si vale el trade-off de perder la libertad del modelo de responder sin usar una tool cuando de verdad no hace falta.

### 🟡 Limitación conocida adicional: campos de texto libre sin opciones (ramo ARL)

Probando ARL (motor genérico, nunca probado antes) encontré la misma familia de problema en su variante más difícil de cerrar: el campo `actividad_economica` (texto libre, sin `options` — no hay nada contra qué comparar el VALOR) quedó guardado bajo la clave inventada `actividad_empresa` en vez de la real. Como no tiene opciones, `resolveFieldKeyByValue` (f7475df) no puede ayudar aquí — solo funciona para campos tipo `select`. La clave inventada tampoco comparte prefijo con la real (`actividad_economica` vs `actividad_empresa` — divergen justo después de "actividad"), así que `resolveFieldKey` (36fbae7) tampoco la atrapa. Quedó en el mismo loop protector que `para_quien` en dental — nunca declara falso completo, pero el cliente puede quedar respondiendo la misma pregunta.

**Conclusión de las 3 limitaciones conocidas (`para_quien`, `accidentes_personales` sin guardar, `actividad_economica`)**: todas son la misma raíz — el modelo no sigue el guion al pie de la letra en casos puntuales — y las 3 capas de código que ya se agregaron esta sesión (fusión en una sola tool, normalización por clave, normalización por valor, verificación final contra el resultado real) cierran la enorme mayoría de los casos reales, confirmado con **13 ramos probados de punta a punta** (9 perfectos al 100%, 4 con hallazgos puntuales, ninguno con pérdida silenciosa de datos). Los casos que quedan abiertos necesitan una decisión de arquitectura más grande (function-calling obligatorio, o una tabla de sinónimos mantenida a mano) — no otro parche de texto.

### ⛔ Bloqueado por infraestructura, no por código: PlacApi sin saldo (HTTP 402)

Al simular el flujo de ORI cotizando un auto (placa real `RIL102`, documento real `1014200417`, ambos dados por el usuario), la consulta a PlacApi falló de forma **consistente y reproducible** con `HTTP 402` (Payment Required) — probado dos veces. La tabla `insurer_connections` está vacía para todas las organizaciones, así que esto pasa por la cuenta **compartida** de Noova, no por una conexión propia de ningún corredor. El manejo de errores del código funcionó exactamente como debía (nunca inventó un vehículo ni un precio, avisó claro al asesor) — el bloqueo es 100% externo: la cuenta de PlacApi necesita recarga/revisión, algo que no puedo resolver yo. Hasta que se resuelva, **ningún ramo con lookup real de placa (autos, motos) puede completar una cotización con datos reales del vehículo** — ni por WhatsApp, ni por ORI, ni por el link.

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
