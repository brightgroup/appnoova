/** Términos que no deben cortar al agente (coincidencia exacta, sin distinguir mayúsculas). */
export const ELEVENLABS_INTERRUPTION_IGNORE_TERMS = [
  "aló",
  "alo",
  "hola",
  "bueno",
  "buenas",
  "dígame",
  "digame",
  "sí",
  "si",
  "eh",
  "eeh",
  "pues",
  "mm",
  "mmm",
  "mhm",
  "este",
  "o sea",
  "oye",
  "escucha",
  "hello",
  "a ver",
];

/** Turn-taking compartido para todos los agentes premium. */
export function buildPremiumTurnConfig(outboundPhone = false) {
  // Sin soft_timeout: los "fillers" ("un momentico, ya le confirmo") se disparaban
  // en cada silencio y hacían sonar al agente como robot. El re-enganche natural del
  // modelo (turn_timeout) es suficiente y suena humano.
  if (outboundPhone) {
    return {
      // Espera antes de re-enganchar al usuario (una sola vez, luego cuelga por silencio).
      turn_timeout: 7,
      // Da 2 s al inicio para captar si es un buzón antes de comprometerse.
      initial_wait_time: 2,
      // "normal" evita que el agente salte sobre ruido de fondo o se corte solo.
      turn_eagerness: "normal" as const,
      // Cuelga si hay 15 s de silencio total (buzón mudo, línea muerta).
      silence_end_call_timeout: 15,
      spelling_patience: "off" as const,
      speculative_turn: true,
      turn_model: "turn_v3" as const,
      transcribe_on_disabled_interruptions: true,
      interruption_ignore_terms: ELEVENLABS_INTERRUPTION_IGNORE_TERMS,
      // timeout_seconds: -1 DESACTIVA los fillers ("un momentico, ya le confirmo").
      // Debe enviarse explícito porque el PATCH fusiona y no borra el previo.
      soft_timeout_config: { timeout_seconds: -1 },
    };
  }

  return {
    turn_timeout: 7,
    turn_eagerness: "normal" as const,
    // Cuelga tras 15 s de silencio (buzón mudo / línea muerta). Aplica también a
    // agentes de encuesta que salen en campaña aunque su plantilla sea "inbound".
    silence_end_call_timeout: 15,
    speculative_turn: true,
    turn_model: "turn_v3" as const,
    transcribe_on_disabled_interruptions: true,
    interruption_ignore_terms: ELEVENLABS_INTERRUPTION_IGNORE_TERMS,
    // timeout_seconds: -1 DESACTIVA los fillers ("un momentico, ya le confirmo").
    // Debe enviarse explícito porque el PATCH fusiona y no borra el previo.
    soft_timeout_config: { timeout_seconds: -1 },
  };
}

/** Override de turn en cada llamada saliente (prueba, campaña, CRM). */
export function buildPremiumTurnOverride() {
  return buildPremiumTurnConfig(true);
}

/**
 * Configuración técnica de turnos (ElevenLabs API). La conducta humana va en la plantilla del agente.
 */
export const ELEVENLABS_PHONE_OUTBOUND_RULES = `

## Llamada telefónica saliente
- **Tú hablas primero** al conectar: saludo breve con tu nombre y la empresa. No esperes que calle el ruido de fondo ni que todos dejen de hablar.
- Voces de fondo, TV o terceros hablando: **no son el interlocutor** — ignóralas y sigue con quien contestó.
- Tras el saludo, si repiten "aló": "Sí, le escucho" y continúa. No repitas el saludo completo.
- No des pitch largo al abrir; pregunta con quién hablas o en qué puedes colaborar.`;
