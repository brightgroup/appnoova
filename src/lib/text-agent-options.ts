import { ORI_DEFAULT_MODEL } from "@/lib/google-ai";

export const TEXT_LLM_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }
] as const;

export const DEFAULT_TEXT_MODEL = ORI_DEFAULT_MODEL;

export const TEXT_OUTPUT_TOKEN_OPTIONS = [
  { id: 1024, label: "1 024 tokens" },
  { id: 2048, label: "2 048 tokens" },
  { id: 4096, label: "4 096 tokens" }
] as const;
