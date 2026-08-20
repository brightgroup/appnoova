import type { ReactNode } from "react";
import { OpenAILogo } from "@/components/icons/brands/OpenAILogo";
import { GeminiLogo } from "@/components/icons/brands/GeminiLogo";
import { ClaudeLogo } from "@/components/icons/brands/ClaudeLogo";
import type { LlmProvider } from "@/lib/llm/engines";

/** Mismo criterio de prefijo que resolveEngineChain (lib/llm/engines.ts). */
export function inferLlmProvider(modelId: string): LlmProvider | null {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("gpt-")) return "openai";
  return null;
}

const PROVIDER_ICON: Record<LlmProvider, (className: string) => ReactNode> = {
  openai: className => <OpenAILogo className={className} />,
  google: className => <GeminiLogo className={className} />,
  anthropic: className => <ClaudeLogo className={`${className} text-[#cc785c]`} />
};

/** Icono de marca del proveedor para un id de modelo — null si no matchea ninguno conocido. */
export function llmModelIcon(modelId: string, className = "w-4 h-4 shrink-0"): ReactNode {
  const provider = inferLlmProvider(modelId);
  return provider ? PROVIDER_ICON[provider](className) : null;
}
