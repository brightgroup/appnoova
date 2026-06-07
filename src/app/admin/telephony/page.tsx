"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AdminTelephonyPanel } from "@/components/telephony/AdminTelephonyPanel";

function AdminTelephonyContent() {
  const params = useSearchParams();
  const initialTab = params.get("tab") === "solicitudes" ? "requests" : "lines";
  return (
    <AdminTelephonyPanel
      preselectedUserId={params.get("user_id")}
      initialTab={initialTab}
    />
  );
}

export default function AdminTelephonyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <AdminTelephonyContent />
    </Suspense>
  );
}
