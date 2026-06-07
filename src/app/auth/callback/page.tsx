"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verificando tu cuenta...");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Intenta obtener la sesión después del redirect de Supabase
        const { data: { session }, error } = await supabase.auth.getSession();

        if (session) {
          setStatus("success");
          setMessage("¡Cuenta verificada! Redirigiendo al dashboard...");
          setTimeout(() => router.push("/dashboard"), 2000);
          return;
        }

        // Si no hay sesión, intenta con el hash fragment (#access_token=...)
        const hash = window.location.hash;
        if (hash) {
          const params = new URLSearchParams(hash.slice(1));
          const accessToken  = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token:  accessToken,
              refresh_token: refreshToken
            });

            if (!sessionError) {
              setStatus("success");
              setMessage("¡Cuenta verificada! Redirigiendo al dashboard...");
              setTimeout(() => router.push("/dashboard"), 2000);
              return;
            }
          }
        }

        if (error) throw error;
        throw new Error("No se pudo verificar la sesión");
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "Error al verificar la cuenta.");
      }
    };

    handleCallback();
  }, [router]);

  return (
    <>
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-grid"   aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-3xl p-8 text-center"
          style={{
            background: "linear-gradient(145deg, rgba(16,17,28,.97) 0%, rgba(10,11,20,.9) 100%)",
            border: "1px solid rgba(255,255,255,.08)",
            boxShadow: "0 0 0 1px rgba(91,91,246,.12), 0 24px 64px rgba(0,0,0,.6)",
          }}
        >
          <div className="flex justify-center mb-5">
            {status === "loading" && (
              <div className="w-16 h-16 rounded-full bg-[#5b5bf6]/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#5b5bf6] animate-spin" />
              </div>
            )}
            {status === "success" && (
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            )}
            {status === "error" && (
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold text-white mb-2">
            {status === "loading" && "Verificando cuenta"}
            {status === "success" && "¡Cuenta verificada!"}
            {status === "error"   && "Error de verificación"}
          </h1>

          <p className="text-sm text-gray-400 mb-6">{message}</p>

          {status === "error" && (
            <a
              href="/login"
              className="inline-flex items-center justify-center w-full py-3 px-4 rounded-xl bg-[#5b5bf6] hover:bg-[#7070f8] text-white text-sm font-semibold transition-all"
            >
              Volver al login
            </a>
          )}
        </div>

        <p className="mt-8 text-xs text-gray-700">© 2026 BG Soluciones · Noova 360</p>
      </div>
    </>
  );
}
