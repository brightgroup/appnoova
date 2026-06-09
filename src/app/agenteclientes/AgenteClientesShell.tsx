"use client";

import dynamic from "next/dynamic";
import { BROKER } from "./broker-config";
import { AgentAvatar } from "./AgentAvatar";

function AgenteClientesLoading() {
  return (
    <div className="agente-clientes-root" aria-busy="true" aria-label="Cargando asistente">
      <header className="ac-header">
        <div className="ac-header-inner">
          <div className="ac-brand">
            <AgentAvatar variant="header" agentName={BROKER.agentName} />
            <div>
              <p className="ac-brand-name">{BROKER.name}</p>
              <p className="ac-brand-sub">Asistente virtual · {BROKER.agentName}</p>
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
  { ssr: false, loading: AgenteClientesLoading }
);

export default function AgenteClientesShell() {
  return <AgenteClientesClient />;
}
