import {
  Target,
  Bell,
  TrendingUp,
  Headphones,
  Calendar,
  ShoppingBag,
  Globe,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { AgentChannel } from "@/lib/agent-purpose-catalog";

const VOICE_ICONS: Record<string, LucideIcon> = {
  "lead-qualification": Target,
  "policy-reminder": Bell,
  "follow-up": TrendingUp,
  "customer-service": Headphones,
  "meeting-scheduling": Calendar,
};

const TEXT_ICONS: Record<string, LucideIcon> = {
  "lead-qualification": Target,
  "sales-inquiries": ShoppingBag,
  "customer-assistant": MessageCircle,
  "website-qa": Globe,
  "meeting-scheduling": Calendar,
  "support-follow-up": TrendingUp,
};

export function getPurposeIcon(channel: AgentChannel, purposeId: string): LucideIcon {
  const map = channel === "voice" ? VOICE_ICONS : TEXT_ICONS;
  return map[purposeId] ?? Target;
}
