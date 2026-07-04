import {
  PREMIUM_END_CALL_TOOL,
  PREMIUM_VOICEMAIL_DETECTION_TOOL,
} from "@/lib/elevenlabs/default-voices";

/** Bloque de prioridad máxima para campañas salientes (sin apertura hasta confirmar humano). */
export const CAMPAIGN_OUTBOUND_VOICEMAIL_BLOCK = `

## REGLA #0 — Buzón de voz (PRIORIDAD ABSOLUTA)
- Escucha primero 2-4 segundos SIN hablar.
- Si detectas contestadora, buzón, tono grabado o "deje su mensaje después del tono": usa voicemail_detection DE INMEDIATO.
- PROHIBIDO hablar, saludar, presentarte o dejar mensaje en buzón.
- PROHIBIDO decir en voz alta que detectaste buzón; solo ejecuta la herramienta y cuelga.
- Solo continúa el guion si una persona REAL responde con "aló", "bueno", "dígame" o similar conversacional.`;

export const CAMPAIGN_ELEVENLABS_OUTBOUND_TOOLS = [
  PREMIUM_VOICEMAIL_DETECTION_TOOL,
  PREMIUM_END_CALL_TOOL,
];
