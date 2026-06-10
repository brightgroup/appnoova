"use client";

import { createContext, useContext } from "react";
import type { PublicMicrositeConfig } from "@/types/microsite";
import { DEMO_MICROSITE_CONFIG } from "@/app/agenteclientes/broker-config";

const MicrositeContext = createContext<PublicMicrositeConfig>(DEMO_MICROSITE_CONFIG);

export function MicrositeProvider({
  config,
  children
}: {
  config: PublicMicrositeConfig;
  children: React.ReactNode;
}) {
  return (
    <MicrositeContext.Provider value={config}>
      {children}
    </MicrositeContext.Provider>
  );
}

export function useMicrosite(): PublicMicrositeConfig {
  return useContext(MicrositeContext);
}
