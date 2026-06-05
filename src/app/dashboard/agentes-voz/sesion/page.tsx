"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function SesionRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const template = params.get("template") || "lead-qualification";

  useEffect(() => {
    router.replace("/dashboard/agentes-voz");
  }, [router, template]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0d0e14] text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export default function SesionPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-[#0d0e14] text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <SesionRedirect />
    </Suspense>
  );
}
