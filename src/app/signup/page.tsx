"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Lock } from "lucide-react";
import { getMarketingSiteUrl, marketingPath } from "@/lib/marketing-site-url";

export default function SignupPage() {
  const marketingUrl = getMarketingSiteUrl();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#06070d] px-4 py-12">
      <a href={marketingUrl} className="mb-10 flex items-center">
        <div className="relative h-14 w-14">
          <Image src="/logo-noova.png" alt="Noova 360" fill className="object-contain object-center" />
        </div>
      </a>

      <div
        className="w-full max-w-[420px] rounded-3xl p-8 sm:p-10 text-center"
        style={{
          background: "linear-gradient(145deg, rgba(16,17,28,.97) 0%, rgba(10,11,20,.9) 100%)",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "0 0 0 1px rgba(15,126,255,.12), 0 24px 64px rgba(0,0,0,.6)",
        }}
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f7eff]/15 border border-[#0f7eff]/25">
          <Lock className="h-5 w-5 text-[#99c9ff]" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Registro con invitación</h1>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">
          Por ahora no hay registro público. Solicite acceso con el formulario y nuestro equipo
          creará su cuenta manualmente.
        </p>

        <a
          href={marketingPath("/?solicitar=acceso")}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f7eff] py-3 text-sm font-semibold text-white transition-all hover:bg-[#3392ff]"
        >
          Solicitar acceso
          <ArrowRight className="h-4 w-4" />
        </a>

        <Link
          href="/login"
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          ¿Ya tiene cuenta? Iniciar sesión
        </Link>
      </div>
    </div>
  );
}
