import { Code2, Facebook, Instagram, Link2, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import type { BadgeVariant } from "@/components/ui/Badge";

export interface InboxChannelStyle {
  icon: LucideIcon;
  label: string;
  variant: BadgeVariant;
}

const STYLES: Record<string, InboxChannelStyle> = {
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    variant: "emerald",
  },
  instagram: {
    icon: Instagram,
    label: "Instagram",
    variant: "violet",
  },
  messenger: {
    icon: Facebook,
    label: "Messenger",
    variant: "blue",
  },
  web_widget: {
    icon: Link2,
    label: "Mi Link",
    variant: "violet",
  },
  web_embed: {
    icon: Code2,
    label: "Widget",
    variant: "sky",
  },
  web_test: {
    icon: MessageSquare,
    label: "API",
    variant: "amber",
  },
  voice_test: {
    icon: Phone,
    label: "Voz",
    variant: "orange",
  },
};

export function inboxChannelStyle(channel: string): InboxChannelStyle {
  return STYLES[channel] ?? STYLES.web_test;
}
