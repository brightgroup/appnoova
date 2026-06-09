export {
  deriveQualityLabel as deriveTextQualityLabel,
  formatCostUsd,
  formatCostPerResult,
  qualityBadgeClass
} from "@/lib/voice-agent-display";

export function formatMessagesPerConversation(messages: number, conversations: number): string {
  if (conversations <= 0) return "-";
  return (messages / conversations).toFixed(1);
}
