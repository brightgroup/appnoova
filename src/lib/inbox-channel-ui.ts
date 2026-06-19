import { Code2, Link2, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import {
  tagNeonAmber,
  tagNeonEmerald,
  tagNeonOrange,
  tagNeonSky,
  tagNeonViolet,
} from "@/lib/brand-ui";

export interface InboxChannelStyle {
  icon: LucideIcon;
  label: string;
  badgeClass: string;
}

const STYLES: Record<string, InboxChannelStyle> = {
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    badgeClass: tagNeonEmerald,
  },
  web_widget: {
    icon: Link2,
    label: "Mi Link",
    badgeClass: tagNeonViolet,
  },
  web_embed: {
    icon: Code2,
    label: "Widget",
    badgeClass: tagNeonSky,
  },
  web_test: {
    icon: MessageSquare,
    label: "API",
    badgeClass: tagNeonAmber,
  },
  voice_test: {
    icon: Phone,
    label: "Voz",
    badgeClass: tagNeonOrange,
  },
};

export function inboxChannelStyle(channel: string): InboxChannelStyle {
  return STYLES[channel] ?? STYLES.web_test;
}
