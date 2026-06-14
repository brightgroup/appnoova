"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AdminWhatsAppPanel } from "@/components/admin/AdminWhatsAppPanel";

export default function AdminWhatsAppPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <AdminWhatsAppPanel />
    </Suspense>
  );
}
