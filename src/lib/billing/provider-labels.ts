/** Metadatos de proveedor para las vistas de consumo en /admin — solo admin, nunca al cliente. */
export const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  google: { label: "Gemini", color: "#0f7eff" },
  anthropic: { label: "Claude", color: "#c084fc" },
  openai: { label: "OpenAI", color: "#10a37f" },
  twilio: { label: "Twilio", color: "#22c55e" },
  meta: { label: "Meta", color: "#0ea5e9" },
  telnyx: { label: "Telnyx", color: "#f59e0b" },
  elevenlabs: { label: "ElevenLabs", color: "#ec4899" },
  otro: { label: "Otro", color: "#6b7280" },
};

export function providerLabel(provider: string): { label: string; color: string } {
  return PROVIDER_LABELS[provider] ?? { label: provider, color: "#6b7280" };
}
