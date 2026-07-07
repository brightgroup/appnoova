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
  const soft_timeout_config = {
    timeout_seconds: 2,
    message: "Un momentico, ya le confirmo.",
    additional_soft_timeout_messages: [
      "Sí, le escucho.",
      "Disculpe, un segundito.",
    ],
    use_llm_generated_message: false,
    max_soft_timeouts_per_generation: 3,
  };

  if (outboundPhone) {
    return {
      turn_timeout: 6,
      // Si por algún motivo no hay first_message, no esperar 7+ s con ruido de fondo.
      initial_wait_time: 1,
      turn_eagerness: "eager" as const,
      spelling_patience: "off" as const,
      retranscribe_on_turn_timeout: true,
      mode: "turn" as const,
      speculative_turn: true,
      turn_model: "turn_v3" as const,
      transcribe_on_disabled_interruptions: true,
      interruption_ignore_terms: ELEVENLABS_INTERRUPTION_IGNORE_TERMS,
      soft_timeout_config,
    };
  }

  return {
    turn_timeout: 8,
    turn_eagerness: "normal" as const,
    mode: "turn" as const,
    speculative_turn: true,
    turn_model: "turn_v3" as const,
    transcribe_on_disabled_interruptions: true,
    interruption_ignore_terms: ELEVENLABS_INTERRUPTION_IGNORE_TERMS,
    soft_timeout_config,
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
