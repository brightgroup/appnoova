"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";

export interface ConnectorSummaryItem {
  id: string;
  name: string;
  connected: boolean;
}

/**
 * Resumen liviano de conectores para superficies que solo necesitan mostrar
 * "qué está conectado" (ej. el menú de "+" del chat de ORI) — no duplica la
 * lógica de conexión en sí, esa sigue viviendo en cada ruta de conector real.
 * Todos los conectores se listan planos, sin agrupar por categoría — agrupar
 * (ej. "Aseguradoras") obliga a mantener una etiqueta especial por vertical
 * cada vez que se suma un conector nuevo, y no escala.
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
      const [calRes, hubspotRes, woocommerceRes, laEquidadRes, softsegurosRes, verifikRes, placapiRes] = await Promise.all([
        fetch("/api/conectores/google-calendar/status", { headers }),
        fetch("/api/conectores/hubspot/status", { headers }),
        fetch("/api/conectores/woocommerce/status", { headers }),
        modules.seguros ? fetch("/api/seguros/conectores/la-equidad/status", { headers }) : Promise.resolve(null),
        modules.seguros ? fetch("/api/seguros/conectores/softseguros/status", { headers }) : Promise.resolve(null),
        modules.seguros ? fetch("/api/seguros/conectores/verifik/status", { headers }) : Promise.resolve(null),
        modules.seguros ? fetch("/api/seguros/conectores/placapi/status", { headers }) : Promise.resolve(null)
      ]);

      const calJson = calRes.ok ? await calRes.json() : null;
      const hubspotJson = hubspotRes.ok ? await hubspotRes.json() : null;
      const woocommerceJson = woocommerceRes.ok ? await woocommerceRes.json() : null;
      const laEquidadJson = laEquidadRes?.ok ? await laEquidadRes.json() : null;
      const softsegurosJson = softsegurosRes?.ok ? await softsegurosRes.json() : null;
      const verifikJson = verifikRes?.ok ? await verifikRes.json() : null;
      const placapiJson = placapiRes?.ok ? await placapiRes.json() : null;

      const next: ConnectorSummaryItem[] = [
        // `configured` solo dice que la plataforma tiene credenciales de Google;
        // lo que importa es si esta organización conectó su calendario.
        { id: "google-calendar", name: "Google Calendar", connected: calJson?.connection?.status === "active" },
        { id: "hubspot", name: "HubSpot", connected: hubspotJson?.connection?.status === "active" },
        { id: "woocommerce", name: "WooCommerce", connected: woocommerceJson?.connection?.status === "active" }
      ];
      if (modules.seguros) {
        next.push(
          { id: "la-equidad", name: "La Equidad Seguros", connected: laEquidadJson?.connection?.status === "active" },
          { id: "softseguros", name: "Softseguros", connected: softsegurosJson?.connection?.status === "active" },
          { id: "verifik", name: "Verifik", connected: verifikJson?.connection?.status === "active" },
          { id: "placapi", name: "PlacApi", connected: placapiJson?.connection?.status === "active" }
        );
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
