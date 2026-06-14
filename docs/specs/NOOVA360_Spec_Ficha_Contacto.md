# NOOVA 360 — Especificación de la Ficha de Contacto
**Para:** Equipo de desarrollo
**De:** Founder (vía copiloto estratégico)
**Objetivo:** Construir el objeto "Contacto" como **capa de acción** (no como CRM de registro). Cada campo y función debe disparar, personalizar o cerrar el loop de una acción de IA. Lo que solo "se guarda por guardar" no entra.

---

## 0. Principios de diseño (leer antes de empezar)

1. **Multi-nicho desde el día 1.** El esquema de datos es genérico. El lenguaje visible (labels) es **configurable por tenant**. No hardcodear términos de seguros.
2. **La IA llena la ficha.** La mayoría de los campos se capturan automáticamente durante conversaciones o leyendo documentos. El asesor edita y confirma, no transcribe.
3. **La ficha es un tablero de acción**, no una pantalla de lectura. Desde aquí se lanza WhatsApp, llamadas IA, cotizaciones y tareas.
4. **Contactabilidad gobernada por la plataforma (Meta), no por toggles manuales.** Ver sección 3.
5. **Frontera:** esta ficha NO administra pólizas, cartera, comisiones ni es repositorio documental. Eso vive en el sistema de registro del cliente (ej. Softseguros) o se integra.

---

## 1. Labels configurables por tenant (multi-nicho)

El desarrollador debe permitir configurar estos labels a nivel de tenant. El nombre técnico del campo NO cambia; solo el texto que ve el usuario.

| Nombre técnico (fijo) | Label seguros (default) | Label genérico | Ejemplos otros nichos |
|---|---|---|---|
| `producto_servicio` | Póliza | Producto / Servicio | Membresía (gym), Plan (clínica), Contrato (inmobiliaria) |
| `categoria_interes` | Ramo | Categoría de interés | Servicio, Línea, Especialidad |
| `asesor_asignado` | Asesor | Responsable | Agente, Vendedor, Gestor |

Implementación sugerida: tabla `tenant_label_config` con `campo_tecnico` → `label_personalizado`.

---

## 2. Modelo de datos de la ficha

> Convención: `obligatorio` = la ficha no se guarda sin él. "Quién lo llena" indica la fuente esperada principal.

### 2.1 Identidad

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Notas |
|---|---|---|---|---|
| `nombre` | string | Sí | IA / manual | Nombre completo o de la empresa |
| `tipo_contacto` | enum (`persona`, `empresa`) | Sí | IA / manual | Cambia discurso y categoría |
| `documento_id` | string | No | IA / documento | Cédula/NIT. Llave para integración; no obligatorio |
| `organizacion` | string | No | IA / manual | Empresa o razón social si aplica |

### 2.2 Canales (al menos uno requerido)

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Notas |
|---|---|---|---|---|
| `whatsapp` | string (E.164) | Condicional | Sistema (inbound) | Canal principal |
| `telefono` | string (E.164) | No | IA / manual | Lo usa la IA de voz |
| `email` | string | No | IA / manual | — |
| `canal_preferido` | enum (`whatsapp`,`telefono`,`email`) | No | IA / manual | — |
| `estado_whatsapp` | enum (`valido`,`invalido`,`rebotado`) | No | Sistema | Evita disparar a número muerto |
| `estado_email` | enum (`valido`,`invalido`,`rebotado`) | No | Sistema | — |

Regla: debe existir al menos un canal de contacto válido para poder ejecutar acciones.

### 2.3 Contactabilidad y consentimiento (ver lógica en sección 3)

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Notas |
|---|---|---|---|---|
| `ultimo_inbound_wa` | timestamp | No | Sistema | Última vez que el contacto escribió por WhatsApp |
| `ventana_wa_estado` | enum derivado (`abierta`,`requiere_plantilla`,`sin_conversacion`) | — | Sistema (calculado) | No editable. Se calcula con `ultimo_inbound_wa` |
| `supresiones` | multi-select (`no_whatsapp`,`no_llamadas`,`no_email`) | No | IA / manual | Modelo opt-OUT. Si el contacto pide parar |
| `autorizacion_datos` | bool | No | IA / formulario | Habeas Data (Ley 1581) |
| `autorizacion_datos_fecha` | timestamp | No | Sistema | — |
| `autorizacion_datos_fuente` | string | No | Sistema | Dónde dio la autorización |

### 2.4 Contexto y segmentación

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Notas |
|---|---|---|---|---|
| `fuente_origen` | enum configurable (`anuncio_meta`,`web`,`referido`,`recepcion_ia`,`base`,`otro`) | No | Sistema / manual | De dónde llegó |
| `categorias_interes` | multi-select configurable | No | IA / manual | Label "Ramo" en seguros. Le dice a ORI qué cotizar |
| `ciudad` | string | No | IA / manual | — |
| `etiquetas` | tags libres | No | IA / manual | Segmentación flexible |

### 2.5 Relación y asignación

| Campo técnico | Tipo | Obligatorio | Quién lo llena | Notas |
|---|---|---|---|---|
| `asesor_asignado` | relación → usuario | No | Manual / regla | Enruta notificaciones y llamadas |
| `tipo_relacion` | enum (`prospecto`,`cliente`,`referido`,`inactivo`) | Sí (default `prospecto`) | IA / manual | NO es la etapa del embudo (eso va en Lead) |
| `leads_asociados` | relación → Lead (1:N) | No | Sistema | — |
| `productos_servicios_asociados` | relación → Producto/Servicio (1:N) | No | Sistema / integración | Solo trigger de renovación, no administración |

### 2.6 Procedencia por campo (diferenciador clave)

Cada campo editable debe llevar metadata de auditoría. Implementar como columnas asociadas o tabla `campo_metadata`.

| Metadato | Tipo | Notas |
|---|---|---|
| `origen` | enum (`manual`,`ia_conversacion`,`documento`,`importacion`,`integracion`) | De dónde salió el dato |
| `confianza` | enum (`alta`,`media`,`baja`) o float 0–1 | Solo para datos capturados por IA |
| `verificado` | bool | El asesor confirmó el dato |
| `actualizado_por` | usuario / `sistema_ia` | — |
| `actualizado_en` | timestamp | — |

Uso: la UI muestra un indicador visual cuando un dato lo capturó la IA y está "pendiente de verificar".

### 2.7 Propiedades personalizadas

Mantener la funcionalidad existente: el tenant puede crear propiedades propias del contacto (ya implementado). Es la válvula de escape multi-nicho.

---

## 3. Lógica de contactabilidad (motor de reglas)

> Esta es la parte crítica. NO hay opt-in manual. El permiso lo gobierna la plataforma.

### 3.1 WhatsApp
- La IA **nunca inicia WhatsApp en frío**. El contacto debe haber escrito primero.
- Al recibir un inbound, se actualiza `ultimo_inbound_wa = ahora`.
- `ventana_wa_estado` se calcula:
  - `abierta` → `ahora - ultimo_inbound_wa <= 24h` → la IA puede responder con mensaje libre.
  - `requiere_plantilla` → `> 24h` y existió conversación previa → solo plantilla aprobada (HSM) de Meta.
  - `sin_conversacion` → nunca ha escrito → no se puede contactar por WhatsApp.
- Si `no_whatsapp` está en `supresiones` → bloquear todo envío, incluso plantilla.

### 3.2 Llamadas IA
- Uso permitido: recordatorios/renovaciones a `tipo_relacion = cliente`, calificación de leads que ya dieron datos por inbound, y recepción (inbound).
- **Nunca llamadas en frío.**
- Si `no_llamadas` está en `supresiones` → bloquear.

### 3.3 Email
- Uso relacional/transaccional (no marketing en frío).
- Si `no_email` está en `supresiones` → bloquear.

### 3.4 Autorización de datos (Habeas Data)
- `autorizacion_datos` se registra cuando el contacto la otorga (formulario, conversación). Es independiente de la contactabilidad por canal. Validar alcance legal con asesoría jurídica.

---

## 4. Funciones de la ficha (acciones)

| Función | Comportamiento | Regla |
|---|---|---|
| Iniciar/continuar conversación IA (WhatsApp) | Abre el hilo y deja que la IA responda | Solo si `ventana_wa_estado != sin_conversacion` y sin supresión |
| Lanzar llamada IA | Dispara llamada de voz (recordatorio/renovación/calificación) | Respeta sección 3.2 |
| Timeline omnicanal embebido | Muestra todas las interacciones (WhatsApp, llamadas, email) en un solo hilo cronológico | Fuente de memoria para ORI |
| Captura automática por IA | La IA crea/actualiza campos durante la conversación, con `origen` y `confianza` | Marca datos no verificados |
| Lectura de documentos (PDF) | Subir documento → IA extrae datos → vuelca al contacto con `origen = documento` | Pedir verificación humana |
| Crear/asociar Lead | Botón que abre una oportunidad en el kanban vinculada al contacto | — |
| Generar cotización (ORI) | ORI genera link estilizado de cotización y permite enviarlo | — |
| Asignar tarea/recordatorio | Crea tarea para el asesor o para la IA | Alimenta el motor de ORI |
| Notas | Notas manuales + resúmenes automáticos de conversaciones | — |
| Deduplicación / merge | Detecta y unifica contactos repetidos por número/email/documento | Crítico para trazabilidad 360 |
| Próximo paso sugerido | Línea superior con recomendación de la IA (ej. "pidió cotización hace 2 días, sin respuesta — ¿reactivar?") | Basado en timeline + estado |

---

## 5. Lo que NO se construye en esta ficha

- Administración completa de productos/pólizas, endosos, anexos.
- Comisiones y liquidaciones.
- Cartera, saldos, contabilidad.
- Repositorio documental permanente.
- Expediente histórico completo del cliente.

Todo eso pertenece al sistema de registro (Softseguros u otro) y se conecta vía integración cuando exista.

---

## 6. Criterios de aceptación (QA)

1. Un contacto puede crearse manualmente y también de forma automática a partir de un inbound de WhatsApp, sin duplicarse.
2. Los labels (`Póliza`/`Ramo`/`Asesor`) cambian según la configuración del tenant sin tocar código.
3. La IA no puede enviar un WhatsApp libre si la ventana lleva más de 24h; en ese caso solo ofrece plantilla.
4. Una supresión (`no_llamadas`, etc.) bloquea efectivamente esa vía, incluso para la IA.
5. Cada dato muestra su `origen`; los capturados por IA aparecen marcados como no verificados hasta que un humano los confirme.
6. Desde la ficha se puede, en un clic: abrir conversación, lanzar llamada IA, crear lead, generar cotización y crear tarea.
7. El merge de duplicados conserva el timeline completo de ambos contactos.

---

## 7. Fuera de alcance de esta entrega (siguientes objetos)

Esta spec cubre **solo Contacto**. Los siguientes objetos (Lead/Oportunidad, Timeline, Tareas/Recordatorios, Producto/Servicio) se especificarán por separado para no saturar la implementación.
