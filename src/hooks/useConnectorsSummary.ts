"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";

export interface ConnectorSummaryItem {
  id: string;
  name: string;
  connected: boolean;
  /** Agrupa varias filas bajo un mismo encabezado (ej. "Aseguradoras"). */
  group?: string;
}

/**
 * Resumen liviano de conectores para superficies que solo necesitan mostrar
 * "qué está conectado" (ej. el menú de "+" del chat de ORI) — no duplica la
 * lógica de conexión en sí, esa sigue viviendo en cada ruta de conector real.
 */
export function useConnectorsSummary() {
  const { modules } = useOrgPermissions();
  const [items, setItems] = useState<ConnectorSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { getAuthHeaders } = await import("@/lib/text-agents-api");
      const headers = await getAuthHeaders();
      const [calRes, hubspotRes, laEquidadRes] = await Promise.all([
        fetch("/api/conectores/google-calendar/status", { headers }),
        fetch("/api/conectores/hubspot/status", { headers }),
        modules.seguros
          ? fetch("/api/seguros/conectores/la-equidad/status", { headers })
          : Promise.resolve(null)
      ]);

      const calJson = calRes.ok ? await calRes.json() : null;
      const hubspotJson = hubspotRes.ok ? await hubspotRes.json() : null;
      const laEquidadJson = laEquidadRes?.ok ? await laEquidadRes.json() : null;

      const next: ConnectorSummaryItem[] = [
        { id: "google-calendar", name: "Google Calendar", connected: Boolean(calJson?.configured) },
        { id: "hubspot", name: "HubSpot", connected: hubspotJson?.connection?.status === "active" }
      ];
      if (modules.seguros) {
        next.push({
          id: "la-equidad",
          name: "La Equidad Seguros",
          connected: laEquidadJson?.connection?.status === "active",
          group: "Aseguradoras"
        });
      }
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [modules.seguros]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, refresh: load };
}
