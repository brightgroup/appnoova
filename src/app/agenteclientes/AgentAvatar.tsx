"use client";

import { MessageCircle, Shield } from "lucide-react";

export function AgentAvatar({
  variant = "header",
  agentName
}: {
  variant?: "header" | "hero";
  agentName: string;
}) {
  const isHeader = variant === "header";

  return (
    <div
      className={`ac-agent-wrap ac-agent-wrap--${variant}`}
      aria-hidden={isHeader}
      role={isHeader ? undefined : "img"}
      aria-label={isHeader ? undefined : `Asistente ${agentName}`}
    >
      <div className={`ac-agent-avatar ac-agent-avatar--${variant}`}>
        <MessageCircle size={isHeader ? 14 : 36} strokeWidth={1.5} />
      </div>
      <div className={`ac-agent-badge ac-agent-badge--${variant}`}>
        <Shield size={isHeader ? 10 : 14} strokeWidth={2} />
      </div>
    </div>
  );
}
