"use client";

import dynamic from "next/dynamic";
import type { PublicMicrositeConfig } from "@/types/microsite";
import { DEMO_MICROSITE_CONFIG } from "./broker-config";
import { MicrositeProvider } from "./microsite-context";
import { BrokerLogo } from "./BrokerLogo";
import { useMicrosite } from "./microsite-context";

function AgenteClientesLoadingInner() {
  const config = useMicrosite();
  return (
    <div className="agente-clientes-root" aria-busy="true" aria-label="Cargando asistente">
      <header className="ac-header">
        <div className="ac-header-inner">
          <div className="ac-brand">
            <BrokerLogo
              logoUrl={config.faviconUrl ?? config.logoUrl}
              initials={config.initials}
              name={config.name}
              className="ac-logo--favicon"
            />
            <div>
              <p className="ac-brand-name">{config.name}</p>
              <p className="ac-brand-sub">Asistente virtual · {config.agentName}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="ac-main ac-main--idle" />
    </div>
  );
}

const AgenteClientesClient = dynamic(
  () => import("./AgenteClientesClient"),
  { ssr: false, loading: () => <AgenteClientesLoadingInner /> }
);

export default function AgenteClientesShell({
  config
}: {
  config?: PublicMicrositeConfig;
}) {
  return (
    <MicrositeProvider config={config ?? DEMO_MICROSITE_CONFIG}>
      <AgenteClientesClient />
    </MicrositeProvider>
  );
}
