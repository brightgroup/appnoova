"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AgenteClientesShell from "@/app/agenteclientes/AgenteClientesShell";
import { getAuthHeaders } from "@/lib/text-agents-api";
import type { PublicMicrositeConfig } from "@/types/microsite";

function PreviewContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const [config, setConfig] = useState<PublicMicrositeConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const url = id ? `/api/microsite/preview-config?id=${id}` : "/api/microsite/preview-config";
        const res = await fetch(url, { headers });
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
  }, [id]);

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

export default function MicrositioPreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando vista previa...
      </div>
    }>
      <PreviewContent />
    </Suspense>
  );
}
