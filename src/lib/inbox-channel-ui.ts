import { Code2, Link2, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";

export interface InboxChannelStyle {
  icon: LucideIcon;
  label: string;
  badgeClass: string;
}

const STYLES: Record<string, InboxChannelStyle> = {
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    badgeClass: "border-emerald-500/35 bg-emerald-500/20 text-emerald-300"
  },
  web_widget: {
    icon: Link2,
    label: "Mi Link",
    badgeClass: "border-violet-500/35 bg-violet-500/20 text-violet-300"
  },
  web_embed: {
    icon: Code2,
    label: "Widget",
    badgeClass: "border-sky-500/35 bg-sky-500/20 text-sky-300"
  },
  web_test: {
    icon: MessageSquare,
    label: "API",
    badgeClass: "border-amber-500/35 bg-amber-500/20 text-amber-300"
  },
  voice_test: {
    icon: Phone,
    label: "Voz",
    badgeClass: "border-orange-500/35 bg-orange-500/20 text-orange-300"
  }
};

export function inboxChannelStyle(channel: string): InboxChannelStyle {
  return STYLES[channel] ?? STYLES.web_test;
}
