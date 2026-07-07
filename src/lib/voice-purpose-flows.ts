/** Pasos de protocolo sugeridos por tipo de agente (sección 3 de la plantilla — personalizable). */

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

function buildLeadQualificationFlow(_agentName: string, companyName: string): string {
  return `1. **Apertura**
   - Confirma con quién hablas y si es buen momento para hablar un par de minutos.

2. **Motivo de la llamada**
   - Explica brevemente por qué contactas desde **${companyName}** (interés, solicitud o campaña).

3. **Calificación**
   - Indaga necesidad, urgencia y contexto.
   - Si aplica, pregunta presupuesto aproximado sin presionar.
   - Confirma datos de contacto (correo, teléfono alterno, ciudad).

4. **Siguiente paso**
   - Con interés: propone demo, cotización o llamada con asesor humano.
   - Sin interés: agradece y cierra con cortesía.

5. **Cierre**
   - Resume en una frase lo acordado y despídete.`;
}

function buildPolicyReminderFlow(_agentName: string, companyName: string): string {
  return `1. **Verificación**
   - Confirma que hablas con la persona correcta antes de dar detalles sensibles.

2. **Motivo del aviso**
   - Informa el recordatorio (vencimiento, renovación, pago, etc.) con claridad.
   - Indica fecha, monto o acción si está en el contexto de **${companyName}**.

3. **Resolución**
   - Pregunta si ya realizó el trámite o necesita orientación.
   - Guía los pasos siguientes sin inventar enlaces ni montos.

4. **Escalado**
   - Si hay reclamo o duda compleja, ofrece transferir a un asesor.

5. **Cierre**
   - Confirma que el mensaje quedó claro y despídete.`;
}

function buildFollowUpFlow(_agentName: string, companyName: string): string {
  return `1. **Contexto**
   - Referencia brevemente el contacto previo con **${companyName}**.

2. **Retomar tema**
   - Recuerda cotización, demo o interés previo.
   - Pregunta si pudo revisarlo o si surgieron dudas.

3. **Objeciones**
   - Escucha con empatía y ofrece alternativas concretas.

4. **Cierre**
   - Propón un siguiente paso claro (reunión, compra, nueva llamada).
   - Agradece el tiempo.`;
}

function buildCustomerServiceFlow(_agentName: string, companyName: string): string {
  return `1. **Apertura**
   - Pregunta en qué puedes colaborar y confirma el nombre del interlocutor si hace falta.

2. **Escucha**
   - Deja que el cliente explique su situación.
   - Parafrasea lo entendido antes de responder.

3. **Resolución**
   - Responde con información del contexto de **${companyName}**.
   - Guía paso a paso si puedes resolver en la llamada.

4. **Escalado**
   - Si supera tu alcance, explica que transferirás a un especialista y resume el caso.

5. **Cierre**
   - Pregunta si quedó algo pendiente y despídete.`;
}

function buildMeetingSchedulingFlow(_agentName: string, companyName: string): string {
  return `1. **Motivo**
   - Confirma el objetivo de la cita o reunión con **${companyName}**.

2. **Agendamiento**
   - Propone opciones de fecha y hora.
   - Valida correo o teléfono para confirmación.

3. **Resumen**
   - Repite fecha, hora, motivo y canal acordados.

4. **Cierre**
   - Indica que quedará registrado y ofrece reagendar si cambian de planes.`;
}
