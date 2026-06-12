"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function RedirectContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const tab = params.get("tab") || "link";
    router.replace(`/dashboard/canales/mi-link/configuracion?tab=${tab}`);
  }, [router, params]);

  return (
    <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      Redirigiendo...
    </div>
  );
}

export default function MicrositioConfigRedirectPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <RedirectContent />
    </Suspense>
  );
}
