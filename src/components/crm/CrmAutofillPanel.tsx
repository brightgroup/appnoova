"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { Switch } from "@/components/ui/Switch";

export function CrmAutofillPanel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/autofill-settings", { headers });
    const data = await res.json();
    if (res.ok) setEnabled(data.enabled === true);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    const headers = await getAuthHeaders();
    await fetch("/api/crm/autofill-settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ enabled: next })
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Controla si la IA crea y completa automáticamente contactos y leads del CRM a partir
        de las conversaciones de Mi Link y el widget web (WhatsApp siempre lo hace, sin este
        interruptor).
      </p>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[.10] bg-white/[.04] px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-gray-200">Autocompletar CRM con IA</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Al chatear por Mi Link o el widget, crea el contacto y avanza el lead sin
            intervención manual.
          </p>
        </div>
        <Switch checked={enabled} onChange={toggle} disabled={saving} />
      </div>
    </div>
  );
}
