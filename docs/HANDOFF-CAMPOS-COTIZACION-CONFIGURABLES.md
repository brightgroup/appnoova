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

## 🔴 Bug pendiente — el más importante para revisar primero

**Los datos del RAMO (no del tomador) no se están guardando en el motor genérico.** En la prueba de Mascotas: después de los botones "Perro"/"Gato", el modelo siguió la conversación de forma coherente (preguntó nombre, edad, raza de la mascota, en el orden correcto) pero **dejó de llamar `registrar_dato_cotizacion`** — improvisó las preguntas por su cuenta en vez de usar la tool. Resultado: `insurance_quote_requests.datos_riesgo` quedó vacío (`{}`) aunque la conversación "se veía" completa.

Confirmado en DB — quote id `6b547013-d97a-4327-9268-940999982e4b` (org Resguarda, conversación real, puedes borrarla si quieres limpiar la cuenta de prueba):
```
tomador: { nombre_tomador, documento_tomador, fecha_nacimiento_tomador, ocupacion }  ✅ completo
datos_riesgo: {}  ❌ vacío — "Perro", "Firulais", "3 años", "Criollo" nunca se guardaron
```

**Por qué pasa (hipótesis, no 100% confirmada — no tengo logs de Coolify en local):** es el mismo problema de fondo del handoff original — el modelo no llama la tool de forma confiable en cada turno, ahora en `registrar_dato_cotizacion` en vez de en `presentar_opciones_whatsapp`. El motor genérico le pide al modelo "llama la tool en cuanto el cliente responda" en prosa (ver `generic-quote-agent-tools.ts` → `buildPromptBlock`), a diferencia de los 6 ramos con tool dedicada, donde el modelo reenvía TODOS los datos conocidos como argumentos de una sola tool cada turno (no depende de que "recuerde" seguir llamando una tool incremental).

**Ya until ahora arreglé** (y esto SÍ quedó bien, confirmado): que `registrar_dato_cotizacion` perdiera el `quote_request_id` entre turnos (commit `7d920a6`) — ese bug sí estaba 100% en el código, ya no depende de que el modelo recuerde un id. Lo que queda es un problema de **confiabilidad del modelo**, no de plomería.

**Sugerencias para la próxima sesión** (no las implementé, requieren pruebas iterativas que no me dio tiempo de hacer bien esta noche):
1. Reforzar el prompt de `registrar_dato_cotizacion` — decirle explícitamente "SIEMPRE llama esta tool con la respuesta del cliente antes de escribir tu próximo mensaje, incluso si la pregunta es simple como el nombre o la edad".
2. Considerar rediseñar el motor genérico para que funcione como los 6 ramos dedicados: una sola tool que reciba TODOS los campos conocidos de la conversación como argumentos cada turno (en vez de "arrancar" + "registrar incrementalmente") — más robusto porque no depende de que el modelo decida llamar la tool en cada mensaje, a costa de un schema de function-calling menos flexible (mismo trade-off que ya documenté para los 6 ramos fijos).
3. Probar con más turnos/ramos para ver si el patrón se repite siempre después del primer campo con botones, o es aleatorio.
4. Sí tengo logs de servidor en Coolify (no accesibles desde aquí) — revisarlos mostraría si la tool realmente no se llamó, o se llamó y falló silenciosamente.

## Otros hallazgos de esta sesión (ya arreglados y desplegados)

1. **Campos con clave desconocida rompían los 6 ramos dedicados** (commit `5a0ca02`): la org de prueba tenía filas viejas en `poliza_ramo_campos` para Hogar (18 campos, de una sesión anterior al 12 de sept) con claves que no coinciden con el esquema fijo de `home-quote-tool.ts`. `resolveCampos()` ahora filtra a solo las claves que la tool puede recibir de verdad. **Quedan 18 filas de Hogar en la DB para la org de prueba que ya no afectan nada pero son ruido en la UI admin** — si algún día migras Hogar al motor genérico, esas filas (con el desglose "Valores a asegurar" completo) se vuelven útiles automáticamente; si no, puedes borrarlas cuando quieras.
2. **Posible envío duplicado de botones bajo respuesta lenta**: una sola vez, en la prueba de Mascotas, los botones "Perro"/"Gato" llegaron dos veces seguidas. No se repitió en los turnos siguientes. Hipótesis más probable: reintento de webhook de Twilio por una respuesta lenta (no exclusivo de mi código nuevo — le pasaría a cualquier tool que tarde). No alcancé a confirmarlo con logs de Twilio/Coolify.

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

## Datos para depurar

| Qué | Valor |
|---|---|
| Org de prueba | Resguarda — `bd23473f-a2dd-436b-9f4a-5814bb24b1ec` |
| WhatsApp probado esta noche | "Noova 360 Oficial" (noova360.com) — cuenta de empresa real, NO Lucia/Resguarda |
| Quote de prueba (Mascotas, incompleta) | `6b547013-d97a-4327-9268-940999982e4b` |
| Migraciones nuevas | 145, 146 (ya aplicadas en dev) |
