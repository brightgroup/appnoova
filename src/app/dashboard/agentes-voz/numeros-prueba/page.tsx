"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { registryPage, registryToolbar, registryContent, textMuted } from "@/lib/brand-ui";
import { TestPhoneNumbersPanel } from "@/components/telephony/TestPhoneNumbersPanel";

export default function NumerosPruebaPage() {
  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/agentes-voz"
            className="p-1.5 hover:bg-white/[.06] rounded-lg text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Números de prueba</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>
              Números exentos de cargos para recibir llamadas de prueba de tus agentes
            </p>
          </div>
        </div>
      </div>
      <div className={registryContent}>
        <TestPhoneNumbersPanel />
      </div>
    </div>
  );
}
