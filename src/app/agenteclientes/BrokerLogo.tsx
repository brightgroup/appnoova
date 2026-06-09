"use client";

import { useState } from "react";

export function BrokerLogo({
  logoUrl,
  initials,
  name,
  className = ""
}: {
  logoUrl?: string | null;
  initials: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showInitials = !logoUrl || failed;

  if (showInitials) {
    return (
      <div className={`ac-logo ac-logo--initials ${className}`.trim()} aria-hidden="true">
        {initials}
      </div>
    );
  }

  return (
    <div className={`ac-logo ac-logo--image ${className}`.trim()}>
      <img src={logoUrl} alt={name} onError={() => setFailed(true)} />
    </div>
  );
}
