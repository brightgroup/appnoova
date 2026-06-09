"use client";

import dynamic from "next/dynamic";

function AgenteClientesLoading() {
  return (
    <div className="agente-clientes-root" aria-busy="true" aria-label="Cargando asistente">
      <header className="ac-header">
        <div className="ac-header-inner">
          <div className="ac-brand">
            <div className="ac-logo">SG</div>
            <div>
              <p className="ac-brand-name">Seguros García & Asociados</p>
              <p className="ac-brand-sub">Asistente virtual · Valentina</p>
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
