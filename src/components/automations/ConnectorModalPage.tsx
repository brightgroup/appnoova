"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

interface ConnectorModalPageProps {
  icon: React.ReactNode;
  title: string;
  loading?: boolean;
  banner?: { kind: "success" | "error"; text: string } | null;
  children: React.ReactNode;
}

/**
 * Modal centrado tipo Claude para gestionar un conector individual — reemplaza el patrón anterior
 * de una página completa (`ChannelListPage`) con una sola tarjeta perdida en medio de una pantalla
 * vacía. Cada conector sigue viviendo en su propia ruta (`/dashboard/conectores/<id>`) porque el
 * flujo OAuth de Google necesita una URL real donde aterrizar de vuelta — pero se ve y se siente
 * como un modal, no como una página.
 */
export function ConnectorModalPage({ icon, title, loading, banner, children }: ConnectorModalPageProps) {
  const router = useRouter();
  const close = () => router.push("/dashboard/conectores");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/[.12] bg-noova-surface shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[.08]">
          <button
            type="button"
            onClick={close}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          {icon}
          <h3 className="text-sm font-bold text-white truncate">{title}</h3>
        </div>

        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : (
            <>
              {banner && (
                <div
                  className={`mb-4 p-3 rounded-xl text-xs border ${
                    banner.kind === "success"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                >
                  {banner.text}
                </div>
              )}
              {children}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
