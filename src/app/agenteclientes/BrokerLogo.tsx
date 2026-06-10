"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

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
      <img key={logoUrl} src={logoUrl} alt={name} onError={() => setFailed(true)} />
    </div>
  );
}
