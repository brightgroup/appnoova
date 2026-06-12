"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MicrositioRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/canales/mi-link/nuevo");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      Redirigiendo...
    </div>
  );
}
