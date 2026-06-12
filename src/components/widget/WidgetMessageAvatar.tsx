"use client";

import { Headset, Sparkles, User } from "lucide-react";
import type { WidgetMessage } from "@/lib/widget-storage";

type AvatarRole = WidgetMessage["role"] | "typing";

export function WidgetMessageAvatar({
  role,
  accent,
  agentName
}: {
  role: AvatarRole;
  accent: string;
  agentName: string;
}) {
  if (role === "user") {
    return (
      <div className="nw-avatar nw-avatar-user" aria-hidden>
        <User className="w-3.5 h-3.5" strokeWidth={2.25} />
      </div>
    );
  }

  if (role === "human") {
    return (
      <div className="nw-avatar nw-avatar-human" aria-hidden title="Asesor humano">
        <Headset className="w-3.5 h-3.5" strokeWidth={2.25} />
      </div>
    );
  }

  const isTyping = role === "typing";

  return (
    <div
      className={`nw-avatar nw-avatar-ai${isTyping ? " nw-avatar-typing" : ""}`}
      aria-hidden
      title={agentName}
      style={{ background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #fff) 100%)` }}
    >
      <Sparkles className="w-3.5 h-3.5" strokeWidth={2.25} />
    </div>
  );
}
