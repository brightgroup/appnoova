"use client";

import { useState } from "react";

/**
 * Chips clicables para la pregunta guiada pendiente (ver `toolPendingQuestion`
 * en src/types/ori.ts y `presentGuidedQuestion` en guided-questions.ts) — el
 * chat web (Mi Link, widget) no tiene el límite de 3 botones/10 filas de
 * WhatsApp, así que un solo componente dinámico basta: se acomoda en fila(s)
 * si las opciones son cortas, o pasa a franja con scroll horizontal si son
 * muchas o largas — nunca dos diseños separados (ver preview aprobado).
 *
 * `classPrefix` decide qué hoja de estilos aplica (`ac-*` en
 * agente-clientes.css para Mi Link, `nw-*` en web-chat-widget.css para el
 * widget) — cada una ya trae su propia variable de color de marca por
 * organización, así el chip hereda el acento correcto sin lógica extra acá.
 */
export function QuestionChips({
  opciones,
  onSendMessage,
  classPrefix
}: {
  opciones: string[];
  onSendMessage: (text: string) => void;
  classPrefix: "ac" | "nw";
}) {
  const [enviado, setEnviado] = useState(false);

  // Franja con scroll cuando hay muchas opciones o son largas — mismo umbral
  // ilustrado en el preview aprobado (evita que la fila crezca infinito).
  const scroll = opciones.length > 6 || opciones.some(o => o.length > 22);

  const handleClick = (opcion: string) => {
    if (enviado) return;
    setEnviado(true);
    onSendMessage(opcion);
  };

  return (
    <div
      className={`${classPrefix}-chip-field${scroll ? ` ${classPrefix}-chip-field--scroll` : ""}`}
      aria-disabled={enviado}
    >
      {opciones.map(opcion => (
        <button
          key={opcion}
          type="button"
          className={`${classPrefix}-chip`}
          disabled={enviado}
          onClick={() => handleClick(opcion)}
        >
          {opcion}
        </button>
      ))}
    </div>
  );
}
