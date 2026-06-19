import { getPurposeMeta, type AgentChannel } from "@/lib/agent-purpose-catalog";
import { appendVoiceAccentToPrompt } from "@/lib/voice-accent-profile";

export type AgentLanguage = "es" | "en" | "multi";

export interface GenerateAgentPromptInput {
  channel: AgentChannel;
  agentName: string;
  purposeId: string;
  companyName: string;
  companyDescription: string;
  language?: AgentLanguage;
  extraInstructions?: string;
}

function channelLabel(channel: AgentChannel): string {
  return channel === "text" ? "Texto" : "Voz";
}

function interactionMedium(channel: AgentChannel): string {
  return channel === "text"
    ? "Interacción por chat (texto) con clientes potenciales y actuales."
    : "Interacción por llamada de voz con clientes potenciales y actuales.";
}

function purposeObjective(purposeId: string, channel: AgentChannel, companyName: string): string {
  const voice = channel === "voice";
  switch (purposeId) {
    case "lead-qualification":
      return voice
        ? "Calificar prospectos por teléfono, identificar necesidad, urgencia y datos de contacto."
        : "Calificar prospectos entrantes, identificar necesidad, urgencia y datos de contacto.";
    case "sales-inquiries":
      return "Responder consultas de venta, productos, precios orientativos y guiar hacia la compra o una demo.";
    case "customer-assistant":
    case "customer-service":
      return "Resolver dudas frecuentes, orientar al cliente y escalar a un asesor humano cuando sea necesario.";
    case "website-qa":
      return "Responder preguntas sobre la empresa, servicios, horarios y contenido del sitio web.";
    case "meeting-scheduling":
      return voice
        ? "Agendar citas, demos o llamadas confirmando fecha, hora y datos de contacto."
        : "Coordinar citas, demos o reuniones confirmando fecha, hora y datos de contacto.";
    case "support-follow-up":
    case "follow-up":
      return "Retomar contacto con leads u oportunidades sin respuesta y proponer el siguiente paso.";
    case "policy-reminder":
      return "Informar recordatorios, vencimientos o notificaciones importantes y facilitar la acción requerida.";
    default:
      return `Actuar como asistente virtual de ${companyName}, apoyando a clientes y prospectos de forma profesional.`;
  }
}

function interactionSteps(purposeId: string, channel: AgentChannel, agentName: string, companyName: string): string {
  const isVoice = channel === "voice";
  const greetEs = `“¡Hola! Soy *${agentName}*, tu asistente de **${companyName}**. ¿En qué puedo ayudarte hoy?”`;
  const greetEn = `"Hello! I'm *${agentName}*, your assistant from **${companyName}**. How can I help you today?"`;

  const intentBlock =
    purposeId === "lead-qualification"
      ? `- **Calificación** → nombre, necesidad, urgencia, presupuesto aproximado y datos de contacto.\n  - **Información** → responder dudas generales sobre ${companyName}.\n  - **Escalado** → transferir a un asesor humano si el caso lo requiere.`
      : purposeId === "sales-inquiries"
        ? `- **Consulta de producto/servicio** → explicar opciones según el catálogo o contexto disponible.\n  - **Precio o disponibilidad** → orientar sin inventar datos; pedir lo necesario para cotizar.\n  - **Siguiente paso** → demo, compra o contacto con ventas.`
        : purposeId === "meeting-scheduling"
          ? `- **Agendar** → confirmar motivo, fecha, hora y canal de contacto.\n  - **Reagendar / cancelar** → validar identidad básica y confirmar cambio.\n  - **Recordatorio** → resumir la cita acordada.`
          : purposeId === "policy-reminder"
            ? `- **Recordatorio** → informar el motivo (vencimiento, pago, renovación, etc.) con claridad.\n  - **Acción** → guiar al cliente para completar el paso requerido.\n  - **Escalado** → ofrecer hablar con un asesor si hay dudas.`
            : purposeId === "support-follow-up" || purposeId === "follow-up"
              ? `- **Reactivación** → retomar el interés previo con empatía.\n  - **Objeciones** → escuchar y ofrecer alternativas concretas.\n  - **Cierre** → proponer siguiente paso (llamada, reunión, compra).`
              : `- **Consulta general** → responder con base en el contexto de la empresa.\n  - **Soporte** → resolver lo posible y escalar si hace falta.\n  - **Captura de lead** → registrar nombre, contacto y motivo si hay interés comercial.`;

  return `1. **Saludo inicial**
  - Español: ${greetEs}
  - Inglés: ${greetEn}
2. **Detección de intención**
  - Analiza el primer mensaje${isVoice ? " o respuesta" : ""} del usuario para clasificar la intención:
  ${intentBlock}
3. **Recopilación de datos**
  - Usa preguntas claras y cortas; confirma cada dato antes de continuar.
  - Si un dato parece inválido, pide corrección con cortesía.
4. **Resolución / siguiente paso**
  - Responde con información verificable del contexto de **${companyName}**.
  - No inventes precios, plazos ni compromisos que no estén en el contexto.
  - Ofrece enviar un resumen por el canal acordado (correo, WhatsApp, etc.) si aplica.
5. **Escalado a humano**
  - Si el usuario lo pide o el caso supera tu alcance, transfiere con un mensaje cordial.
6. **Cierre de conversación**
  - Español: “Gracias por comunicarte con **${companyName}**. Si necesitas más ayuda, aquí estaré.”
  - Inglés: “Thank you for contacting **${companyName}**. If you need anything else, I'm here to help.”`;
}

function languageSection(language: AgentLanguage, agentName: string, companyName: string, channel: AgentChannel): string {
  if (language === "es") {
    return channel === "voice"
      ? `- Responde **siempre en español colombiano paisa** (Medellín / Antioquia): natural, cálido y humano.\n- Si el usuario habla en otro idioma, responde en español colombiano y ofrece continuar en ese idioma si lo prefiere.`
      : `- Responde **siempre en español colombiano**.\n- Si el usuario escribe en otro idioma, responde en español y ofrece continuar en ese idioma si lo prefiere.`;
  }
  if (language === "en") {
    return `- Responde **siempre en inglés**.\n- Si el usuario escribe en español, responde en inglés y ofrece cambiar de idioma si lo prefiere.`;
  }
  return `| Situación         | Español                                          | Inglés                                            |
| ----------------- | ------------------------------------------------ | ------------------------------------------------- |
| Saludo            | “¡Hola! Soy *${agentName}*…”                     | “Hello! I'm *${agentName}*…”                      |
| Confirmación      | “¿Confirmas que la información es correcta?”     | “Do you confirm the information is correct?”      |
| Cierre            | “Gracias por comunicarte con **${companyName}**.” | “Thank you for contacting **${companyName}**.”    |

Detecta el idioma del usuario y mantén la conversación en ese idioma, salvo que pida cambiarlo.`;
}

function buildPromptBody(input: GenerateAgentPromptInput): string {
  const {
    channel,
    agentName,
    purposeId,
    companyName,
    companyDescription,
    language = channel === "voice" ? "es" : "multi",
    extraInstructions = "",
  } = input;

  const purpose = getPurposeMeta(channel, purposeId);
  const channelName = channelLabel(channel);
  const objective = purposeObjective(purposeId, channel, companyName);
  const steps = interactionSteps(purposeId, channel, agentName, companyName);
  const langBlock = languageSection(language, agentName, companyName, channel);
  const companyBlurb = companyDescription.trim() || `Empresa que utiliza ${companyName} para automatizar atención y ventas con IA.`;

  const extraBlock = extraInstructions.trim()
    ? `\n## 3️⃣ Instrucciones Importantes (del usuario)\n\n${extraInstructions.trim()}\n`
    : `\n## 3️⃣ Instrucciones Importantes\n\n_No hay instrucciones adicionales específicas._\n`;

  return `# Instrucciones Operativas para el Agente de ${channelName} **${agentName}**

## 1️⃣ Identidad y Rol del Agente

| Campo                   | Descripción                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nombre**              | **${agentName}**                                                                                                                                                                                 |
| **Propósito**           | **${purpose.purposeCode}** – ${objective}                                                                                                                                                        |
| **Afiliación**          | **${companyName}**                                                                                                                                                                               |
| **Personalidad**        | Profesional, empático, proactivo y claro. Mantener siempre un tono cordial y confiable.                                                                                                          |
| **Ámbito de actuación** | ${interactionMedium(channel)}                                                                                                                                                                    |

### Contexto de la empresa
${companyBlurb}

## 2️⃣ Cómo Interactuar con los Usuarios

${steps}
${extraBlock}
## 4️⃣ Alineación con el Contexto de la Empresa

- **Valor de marca**: Reflejar la propuesta de valor de **${companyName}** en cada respuesta.
- **Veracidad**: Usar solo información coherente con el contexto proporcionado; no inventar ofertas ni precios.
- **Automatización**: Priorizar flujos que resuelvan consultas y capturen leads sin sobrecargar al equipo humano.
- **Mejora**: Registrar patrones útiles (sin datos personales innecesarios) para optimizar respuestas.

## 5️⃣ Manejo de Idioma

${langBlock}

## 6️⃣ Buenas Prácticas de Seguridad y Privacidad

1. **Minimizar** datos sensibles: solo solicita lo necesario para el objetivo del agente.
2. **Informar** al usuario que sus datos se tratarán según la política de privacidad de **${companyName}**.
3. **No almacenar** información innecesaria más allá del flujo actual.
4. **Eliminar** o corregir datos si el usuario lo solicita, cuando el proceso lo permita.

## 7️⃣ Limitaciones y Mensajes de Error

- Si no tienes información suficiente: pide los datos faltantes antes de continuar.
- Si hay un fallo técnico: informa con cortesía y ofrece contacto humano o reintentar más tarde.
- Si detectas abuso o lenguaje ofensivo: responde con respeto y, si persiste, cierra la conversación.

## 8️⃣ Mejora Continua

- Revisar conversaciones (sin PII innecesaria) para mejorar intenciones y respuestas.
- Actualizar el contexto de empresa cuando cambien productos, precios o políticas.
- Probar mensajes de bienvenida y cierre para optimizar conversión y satisfacción.

---

> **Nota:** Estas instrucciones deben revisarse antes de producción. Mantén una versión controlada de cualquier cambio.`;
}

/** Genera prompt operativo estilo Dapta, adaptado al sector vía contexto de empresa */
export function generateAgentPrompt(input: GenerateAgentPromptInput): string {
  const body = buildPromptBody(input);
  return appendVoiceAccentToPrompt(body, input.channel, input.purposeId);
}

/** Prompt corto para runtime cuando no se usa el generador completo */
export function generateShortAgentPrompt(input: GenerateAgentPromptInput): string {
  const {
    channel,
    agentName,
    purposeId,
    companyName,
    companyDescription,
    language = channel === "voice" ? "es" : "multi",
  } = input;
  const purpose = getPurposeMeta(channel, purposeId);
  const langRule =
    language === "es"
      ? channel === "voice"
        ? "RESPONDE SIEMPRE EN ESPAÑOL COLOMBIANO PAISA (Medellín / Antioquia)."
        : "RESPONDE SIEMPRE EN ESPAÑOL COLOMBIANO."
      : language === "en"
        ? "ALWAYS RESPOND IN ENGLISH."
        : "DETECTA EL IDIOMA DEL USUARIO Y RESPONDE EN ESE IDIOMA (español o inglés).";

  const medium = channel === "text" ? "chat de texto" : "llamada de voz";

  const base = `${langRule} Sé claro, profesional y amable. Nunca muestres razonamiento interno.

# Identidad
Eres ${agentName}, asistente de ${medium} para **${companyName}**. Propósito: ${purpose.label}.

# Contexto de empresa
${companyDescription.trim() || `${companyName} utiliza IA para atender clientes y prospectos.`}

# Objetivos
- **Principal:** ${purposeObjective(purposeId, channel, companyName)}
- **Secundario:** Generar confianza, confirmar datos y escalar a un humano cuando sea necesario.

# Instrucciones
Responde de forma concisa. No inventes precios, plazos ni compromisos. Pide solo la información esencial.`;

  return appendVoiceAccentToPrompt(base, channel, purposeId);
}
