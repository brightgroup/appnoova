"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { WhatsAppTemplateEditor } from "@/components/whatsapp/WhatsAppTemplateEditor";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";
import type { WhatsAppTemplateRecord } from "@/types/whatsapp-template";

export default function EditDashboardWhatsAppTemplatePage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [template, setTemplate] = useState<WhatsAppTemplateRecord | null>(null);
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const headers = await getAuthHeaders();
    const [tplRes, chRes] = await Promise.all([
      fetch(`/api/whatsapp/templates/${id}`, { headers }),
      fetch("/api/whatsapp/channels", { headers })
    ]);
    const tplData = await tplRes.json();
    const chData = await chRes.json();
    if (chRes.ok) setChannels(chData.channels ?? []);
    if (tplRes.ok) {
      setTemplate(tplData.template);
    } else {
      setError(tplData.error || "Plantilla no encontrada");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (template?.status !== "pending_approval") return;
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [template?.status, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex-1 flex flex-col bg-noova-main text-white items-center justify-center p-6 text-center">
        <p className="text-red-400 mb-4">{error || "Plantilla no encontrada"}</p>
        <Link
          href="/dashboard/canales/whatsapp/plantillas"
          className="inline-flex items-center gap-2 text-[#a5a5ff] hover:text-white"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver a plantillas
        </Link>
      </div>
    );
  }

  return (
    <WhatsAppTemplateEditor
      mode="edit"
      templateId={id}
      initialTemplate={template}
      channels={channels}
    />
  );
}
