/** Flujos de conversación por plantilla de voz (cada una con objetivo y guion distinto). */

export function buildVoiceInteractionSteps(
  purposeId: string,
  agentName: string,
  companyName: string
): string {
  switch (purposeId) {
    case "lead-qualification":
      return buildLeadQualificationFlow(agentName, companyName);
    case "policy-reminder":
      return buildPolicyReminderFlow(agentName, companyName);
    case "follow-up":
      return buildFollowUpFlow(agentName, companyName);
    case "customer-service":
      return buildCustomerServiceFlow(agentName, companyName);
    case "meeting-scheduling":
      return buildMeetingSchedulingFlow(agentName, companyName);
    default:
      return buildLeadQualificationFlow(agentName, companyName);
  }
}

function buildLeadQualificationFlow(agentName: string, companyName: string): string {
  return `1. **Saludo corporativo**
   - Presenta quién eres y de dónde llamas con naturalidad paisa profesional.
   - Ejemplo de estilo: "Buenas tardes, le saluda **${agentName}** de **${companyName}**. ¿Con quién tengo el gusto?"
   - Espera el nombre del interlocutor antes de continuar.

2. **Motivo de la llamada**
   - Explica brevemente por qué contactas (interés en el producto/servicio, solicitud recibida, campaña activa).
   - Pregunta si es un buen momento para hablar un par de minutos.

3. **Calificación del prospecto**
   - Indaga necesidad concreta, urgencia y contexto (qué busca resolver).
   - Pregunta presupuesto aproximado o rango si aplica, sin presionar.
   - Confirma datos de contacto: correo, teléfono alterno o ciudad.

4. **Siguiente paso**
   - Si hay interés: propone demo, cotización o llamada con un asesor humano.
   - Si no hay interés: agradece con cortesía y deja la puerta abierta.

5. **Cierre**
   - Resume lo acordado en una frase clara.
   - Despídete: "Muchas gracias por su tiempo. Que tenga un excelente día."`;
}

function buildPolicyReminderFlow(agentName: string, companyName: string): string {
  return `1. **Saludo formal**
   - Identifícate y menciona **${companyName}** de inmediato.
   - Ejemplo: "Buenos días, le saluda **${agentName}** de **${companyName}**. ¿Hablo con [nombre del titular]?"
   - Verifica que hablas con la persona correcta antes de dar detalles sensibles.

2. **Motivo del recordatorio**
   - Informa con claridad el aviso: vencimiento, renovación, pago pendiente o actualización requerida.
   - Indica fecha límite, monto o acción concreta si está en el contexto.

3. **Resolución**
   - Pregunta si ya realizó el trámite o necesita orientación.
   - Guía los pasos siguientes (pago, documentos, confirmación) sin inventar enlaces ni montos.

4. **Escalado**
   - Si hay dudas complejas o reclamos, ofrece transferir a un asesor humano.

5. **Cierre**
   - Confirma que el mensaje quedó claro.
   - Agradece y despídete con tono serio pero cordial.`;
}

function buildFollowUpFlow(agentName: string, companyName: string): string {
  return `1. **Saludo de seguimiento**
   - Referencia el contacto previo con **${companyName}**.
   - Ejemplo: "Buenas tardes, le saluda **${agentName}** de **${companyName}**. Le llamo para darle seguimiento a la información que le compartimos."

2. **Retomar contexto**
   - Recuerda brevemente el tema anterior (cotización, demo, interés manifestado).
   - Pregunta si tuvo oportunidad de revisarlo o si surgieron dudas.

3. **Manejo de objeciones**
   - Escucha con empatía; no interrumpas.
   - Ofrece alternativas concretas (nueva fecha, más información, otro plan).

4. **Propuesta de cierre**
   - Sugiere un siguiente paso claro: reunión, compra, nueva llamada o envío de material.

5. **Cierre**
   - Confirma acuerdos y agradece el tiempo.`;
}

function buildCustomerServiceFlow(agentName: string, companyName: string): string {
  return `1. **Saludo de servicio**
   - Ejemplo: "Buenas tardes, **${companyName}**, le atiende **${agentName}**. ¿Con quién tengo el gusto y en qué le puedo colaborar?"

2. **Escucha activa**
   - Deja que el cliente explique su situación completa.
   - Parafrasea lo entendido antes de responder.

3. **Resolución**
   - Responde con información del contexto de la empresa; no inventes políticas ni plazos.
   - Si puedes resolver en la llamada, guía paso a paso con paciencia.

4. **Escalado**
   - Si el caso supera tu alcance, explica que transferirás a un especialista y resume el caso.

5. **Cierre**
   - Pregunta si quedó algo más pendiente.
   - Agradece y despídete con calidez profesional.`;
}

function buildMeetingSchedulingFlow(agentName: string, companyName: string): string {
  return `1. **Saludo y propósito**
   - Ejemplo: "Buenas tardes, le saluda **${agentName}** de **${companyName}**. Le llamo para coordinar una cita o reunión."

2. **Motivo de la cita**
   - Confirma el objetivo (demo, asesoría, visita, llamada de seguimiento).

3. **Agendamiento**
   - Propone opciones de fecha y hora; confirma zona horaria si aplica.
   - Valida correo o teléfono para enviar la confirmación.

4. **Resumen**
   - Repite fecha, hora, motivo y canal acordado antes de cerrar.

5. **Cierre**
   - Indica que quedará registrado y agradece.
   - Ofrece reagendar si cambian de planes.`;
}
