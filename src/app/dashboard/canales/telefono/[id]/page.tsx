"use client";

import { Suspense, use } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { LinePhoneConfigPanel } from "@/components/telephony/LinePhoneConfigPanel";

function TelefonoConfigContent({ lineId }: { lineId: string }) {
  return (
    <div className="flex-1 flex flex-col bg-noova-main min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/canales/telefono" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">Configurar línea</h1>
            <p className="text-xs text-gray-400">Número, estado y agente de voz asignado</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl">
          <LinePhoneConfigPanel lineId={lineId} />
        </div>
      </div>
    </div>
  );
}

export default function TelefonoConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <TelefonoConfigContent lineId={id} />
    </Suspense>
  );
}
