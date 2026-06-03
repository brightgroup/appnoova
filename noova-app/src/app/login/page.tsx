"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Por favor completa todos los campos.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        setError(authError.message || "Correo o contraseña incorrectos.");
        setLoading(false);
        return;
      }

      if (data.user) {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError("Error al iniciar sesión. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-grid"   aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">

        {/* Logo */}
        <Link href="/" className="mb-10 flex items-center">
          <div className="relative h-8 w-32">
            <Image src="/logonoova.png" alt="Noova 360" fill className="object-contain object-center" />
          </div>
        </Link>

        {/* Card de login */}
        <div
          className="w-full max-w-[420px] rounded-3xl p-8 sm:p-10 relative"
          style={{
            background: "linear-gradient(145deg, rgba(16,17,28,.97) 0%, rgba(10,11,20,.9) 100%)",
            border: "1px solid rgba(255,255,255,.08)",
            boxShadow: "0 0 0 1px rgba(99,102,241,.12), 0 24px 64px rgba(0,0,0,.6), 0 0 80px -32px rgba(99,102,241,.2)",
          }}
        >
          {/* Botón cerrar */}
          <Link
            href="/"
            className="absolute top-6 right-6 p-1.5 rounded-lg border border-white/[.1] bg-white/[.05] hover:bg-white/[.1] text-gray-400 hover:text-white transition-all"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </Link>

          <div className="mb-8 text-center">
            <h1 className="text-xl font-bold text-white">Bienvenido de vuelta</h1>
            <p className="mt-1.5 text-sm text-gray-300">Inicia sesión en tu panel Noova 360</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                Correo electrónico
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@noova360.com"
                className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 text-sm text-white placeholder-gray-400 outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-300">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 pr-11 text-sm text-white placeholder-gray-400 outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white transition-colors"
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-400">
                {error}
              </p>
            )}

            {/* Botón submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2 w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Ingresando...</>
              ) : (
                <>Ingresar <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-300">
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 transition-colors font-semibold">
              Crear una cuenta
            </Link>
          </p>
        </div>

        <p className="mt-8 text-xs text-gray-700">
          © 2026 BG Soluciones · Noova 360
        </p>
      </div>
    </>
  );
}
