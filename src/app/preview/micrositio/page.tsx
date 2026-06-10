"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AgenteClientesShell from "@/app/agenteclientes/AgenteClientesShell";
import { getAuthHeaders } from "@/lib/text-agents-api";
import type { PublicMicrositeConfig } from "@/types/microsite";

export default function MicrositioPreviewPage() {
  const [config, setConfig] = useState<PublicMicrositeConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/microsite/preview-config", { headers });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "No se pudo cargar la vista previa");
          return;
        }
        setConfig(data.config);
      } catch {
        if (!cancelled) setError("Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando vista previa...
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-gray-600 px-6 text-center text-sm">
        {error || "Vista previa no disponible"}
      </div>
    );
  }

  return <AgenteClientesShell config={config} />;
}
