export {
  deriveQualityLabel as deriveTextQualityLabel,
  formatCostUsd,
  formatCostPerResult,
  qualityBadgeVariant
} from "@/lib/voice-agent-display";

export function formatMessagesPerConversation(messages: number, conversations: number): string {
  if (conversations <= 0) return "-";
  return (messages / conversations).toFixed(1);
}
