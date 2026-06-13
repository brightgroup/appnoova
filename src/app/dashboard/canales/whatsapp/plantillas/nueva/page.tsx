"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { WhatsAppTemplateEditor } from "@/components/whatsapp/WhatsAppTemplateEditor";
import type { WhatsAppChannelRecord } from "@/types/whatsapp-channel";

export default function NewDashboardWhatsAppTemplatePage() {
  const [channels, setChannels] = useState<WhatsAppChannelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthHeaders()
      .then(headers => fetch("/api/whatsapp/channels", { headers }))
      .then(r => r.json())
      .then(data => {
        setChannels(data.channels ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-noova-main text-white items-center justify-center p-6 text-center">
        <p className="text-gray-400 mb-4">Primero necesitas una línea WhatsApp activa.</p>
        <Link
          href="/dashboard/canales/whatsapp"
          className="inline-flex items-center gap-2 text-[#a5a5ff] hover:text-white"
        >
          <ChevronLeft className="w-4 h-4" />
          Ver líneas WhatsApp
        </Link>
      </div>
    );
  }

  return <WhatsAppTemplateEditor mode="create" channels={channels} />;
}
