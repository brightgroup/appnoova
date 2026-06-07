"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ClientTelephonyPanel } from "@/components/telephony/ClientTelephonyPanel";

function NumerosContent() {
  return <ClientTelephonyPanel />;
}

export default function NumerosTelefonicosPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <NumerosContent />
    </Suspense>
  );
}
