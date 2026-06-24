# Gemini Live — voz paisa (configuración)

Referencia para pruebas en **Google AI Studio → Stream** y para valores en código (`src/lib/gemini-live-config.ts`).

## Modelo

- **gemini-2.5-flash-native-audio** (preview 12-2025 en producción Noova).
- Usar variante **native audio**, no non-native, para voz expresiva en tiempo real.

## Voz (timbre)

En native audio la voz solo aporta **timbre**; el acento paisa lo define el **system instruction** (`src/lib/voice-accent-profile.ts`).

| Voz | Uso recomendado |
|-----|-----------------|
| **Kore** | Femenina, clara — default paisa cálida / calificación |
| **Aoede** | Femenina, cálida — seguimiento, agendar |
| **Charon** | Masculina, profunda — recordatorios serios |

Elegir la que suene más joven y con chispa para el rol; ninguna suena “colombiana” sola.

## AI Studio (Stream)

| Control | Valor recomendado |
|---------|-------------------|
| Idioma | Español / automático (no hay es-CO fijo en native audio) |
| **Affective dialog** | Activado — adapta tono al interlocutor |
| **Temperature** | **0.95 – 1.1** (más vida = entonación cantadita; bajo = tieso) |
| **Proactive audio** | Off en pruebas iniciales |
| **Compresión ventana de contexto** | On en conversaciones largas (~25 tokens/s audio) |

## Código Noova

- Prompt paisa: `src/lib/voice-accent-profile.ts`
- Connect config: `src/lib/gemini-live-config.ts`
- Pipecat: `services/pipecat-voice/bot.py` (`inference_on_context_initialization=False`, `realtime_service_mode=True`, kickoff en silencio hasta el «aló»)

## Lo que no existe en native audio

- Slider de acento, velocidad o pitch directo.
- Para control quirúrgico de pausas/velocidad → TTS Flash con audio tags (no conversacional en vivo).
