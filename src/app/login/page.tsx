"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NoovaLogo } from "@/components/brand/NoovaLogo";
import { DesktopOnlyGate } from "@/components/layout/DesktopOnlyGate";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        password,
      });

      if (authError) {
        if (authError.message?.toLowerCase().includes("email not confirmed")) {
          setError("Tu correo aún no está verificado. Revisa tu bandeja de entrada o contacta al administrador.");
        } else if (authError.message?.toLowerCase().includes("invalid login credentials")) {
          setError("Correo o contraseña incorrectos. Verifica tus datos.");
        } else {
          setError(authError.message || "Error al iniciar sesión.");
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        router.push("/dashboard");
      }
    } catch {
      setError("Error al iniciar sesión. Intenta de nuevo.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[var(--nv-input-border)] bg-[var(--nv-input-bg)] px-4 py-3 text-sm text-[var(--nv-text)] placeholder-[var(--nv-text-faint)] outline-none transition focus:border-[#5b5bf6]/50 focus:ring-2 focus:ring-[#5b5bf6]/15";

  return (
    <DesktopOnlyGate>
    <div className="login-page-bg relative flex min-h-screen flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <div className="login-page-glow" aria-hidden />

      <Link href="/" className="relative z-10 mb-10 flex items-center">
        <NoovaLogo width={180} height={44} priority />
      </Link>

      <div
        className="relative z-10 w-full max-w-[420px] rounded-3xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-surface)] p-8 sm:p-10 shadow-nv-lg"
      >
        <Link
          href="/"
          className="absolute top-6 right-6 p-1.5 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-hover)] hover:bg-[var(--nv-hover-strong)] text-[var(--nv-text-faint)] hover:text-[var(--nv-text)] transition-all"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </Link>

        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-[var(--nv-text)]">Bienvenido de vuelta</h1>
          <p className="mt-1.5 text-sm text-[var(--nv-text-muted)]">Inicia sesión en tu panel Noova 360</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--nv-text-muted)]">
              Correo electrónico
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@noova360.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--nv-text-muted)]">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nv-text-faint)] hover:text-[var(--nv-text)] transition-colors"
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-500 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5b5bf6] py-3 text-sm font-semibold text-white transition-all hover:bg-[#7070f8] hover:shadow-[0_8px_24px_var(--nv-accent-glow)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Ingresando...
              </>
            ) : (
              <>
                Ingresar <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--nv-text-muted)] leading-relaxed">
          ¿Aún no tiene acceso?{" "}
          <Link
            href="/?solicitar=acceso"
            className="text-[var(--nv-accent-text)] hover:text-[#5b5bf6] transition-colors font-semibold"
          >
            Solicitar acceso
          </Link>
        </p>
      </div>

      <p className="relative z-10 mt-8 text-xs text-[var(--nv-text-faint)]">
        © 2026 BG Soluciones · Noova 360
      </p>
    </div>
    </DesktopOnlyGate>
  );
}
