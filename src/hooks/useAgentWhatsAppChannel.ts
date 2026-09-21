"use client";

import { useCallback, useEffect, useState } from "react";

export interface AgentWhatsAppChannel {
  id: string;
  e164: string;
  friendlyName: string | null;
  active: boolean;
}

/**
 * El número de WhatsApp que atiende este agente, para poder mostrarlo como un
 * conector más junto a los demás. La relación vive en `whatsapp_channels`
 * (columna `text_agent_id`), así que se filtra por agente sobre los canales de
 * la organización — no hay endpoint por agente.
 *
 * Si la cuenta no tiene permiso de canales la petición falla y simplemente no
 * se muestra nada: es información accesoria, no debe romper la pantalla.
 */
export function useAgentWhatsAppChannel(agentId: string | null) {
  const [channel, setChannel] = useState<AgentWhatsAppChannel | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!agentId) {
      setChannel(null);
      return;
    }
    setLoading(true);
    try {
      const { getAuthHeaders } = await import("@/lib/text-agents-api");
      const res = await fetch("/api/whatsapp/channels", { headers: await getAuthHeaders() });
      if (!res.ok) {
        setChannel(null);
        return;
      }
      const data = await res.json();
      const match = (data.channels ?? []).find(
        (c: { text_agent_id?: string | null }) => c.text_agent_id === agentId
      );
      setChannel(
        match
          ? {
              id: match.id,
              e164: match.e164,
              friendlyName: match.friendly_name ?? null,
              active: match.status === "active"
            }
          : null
      );
    } catch {
      setChannel(null);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { channel, loading, refresh: load };
}
