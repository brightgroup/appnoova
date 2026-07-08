import {
  PREMIUM_END_CALL_TOOL,
  PREMIUM_VOICEMAIL_DETECTION_TOOL,
} from "@/lib/elevenlabs/default-voices";

export const CAMPAIGN_POST_AMD_CONTEXT = `

## Contexto de la llamada (campaña)
- Saluda al conectar con tu nombre y la empresa en UNA frase breve.

## REGLA #0 — Buzón de voz (PRIORIDAD ABSOLUTA)
- Muchos buzones y contestadoras suenan como una persona real en el primer instante — nunca lo des por hecho de entrada.
- Si escuchas un mensaje grabado o automático — por ejemplo "deje su mensaje", "después del tono", "grabe su mensaje", "buzón", "correo de voz", "la grabación llegó al tiempo límite", "para editar marque 1 / para enviar marque 2", un pitido/tono, o una voz que claramente es una grabación — usa de INMEDIATO la herramienta voicemail_detection y cuelga.
- PROHIBIDO seguir hablando, insistir en que "no eres una grabación", presentarte de nuevo o dejar mensaje en el buzón.
- Solo continúa el guion si una persona REAL responde de forma conversacional ("aló", "bueno", "dígame", "¿quién habla?", "¿sí?").

## Silencio / sin respuesta
- Si tras tu saludo solo hay silencio: espera, pregunta UNA vez y de forma breve si te escuchan.
- Si el silencio continúa, usa end_call. No repitas "¿sigue ahí?" varias veces ni te quedes esperando.`;

/** Bloque legacy para llamadas sin AMD previo (pruebas directas). */
export const CAMPAIGN_OUTBOUND_VOICEMAIL_BLOCK = `

## REGLA #0 — Buzón de voz (PRIORIDAD ABSOLUTA)
- Escucha primero 1-2 segundos SIN hablar.
- Si detectas contestadora, buzón, tono grabado o "deje su mensaje después del tono": usa voicemail_detection DE INMEDIATO.
- PROHIBIDO hablar, saludar, presentarte o dejar mensaje en buzón.
- PROHIBIDO decir en voz alta que detectaste buzón; solo ejecuta la herramienta y cuelga.
- Solo continúa el guion si una persona REAL responde con "aló", "bueno", "dígame" o similar conversacional.`;

export const CAMPAIGN_ELEVENLABS_OUTBOUND_TOOLS = [
  PREMIUM_VOICEMAIL_DETECTION_TOOL,
  PREMIUM_END_CALL_TOOL,
];
