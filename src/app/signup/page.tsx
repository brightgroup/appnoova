"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [nombre,      setNombre]      = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!nombre || !email || !password || !confirmPass) {
      setError("Por favor completa todos los campos.");
      return;
    }

    if (password !== confirmPass) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nombre }
        }
      });

      if (authError) {
        setError(authError.message || "Error al crear la cuenta.");
        setLoading(false);
        return;
      }

      if (data.user) {
        // Insertar perfil en la tabla pública users
        const { error: profileError } = await supabase
          .from("users")
          .insert({
            id: data.user.id,
            email: data.user.email,
            nombre: nombre,
            rol: "user"
          });

        if (profileError) {
          // Si el perfil ya existe (trigger lo creó), ignorar el error de duplicado
          if (!profileError.code?.includes("23505")) {
            console.error("Error al crear perfil:", profileError.message);
          }
        }

        router.push("/dashboard");
      }
    } catch (err: any) {
      setError("Error al crear la cuenta. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-grid"   aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">

        {/* Logo */}
        <div className="mb-10">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-xl">N</span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/10 bg-white/[.02] backdrop-blur-2xl px-8 py-10 shadow-2xl">

            {/* Header */}
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-white mb-2">Crear Cuenta</h1>
              <p className="text-gray-400 text-sm">Únete a Noova 360</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Nombre */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                  placeholder="Juan García"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                  placeholder="tu@email.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  >
                    {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-8 w-full rounded-lg bg-[#5b5bf6] hover:bg-[#7070f8] py-3 font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    Crear Cuenta
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              {/* Login Link */}
              <p className="text-center text-sm text-gray-400 mt-6">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/login"
                  className="text-violet-400 hover:text-violet-300 transition-colors font-medium"
                >
                  Inicia sesión
                </Link>
              </p>
            </form>

          </div>
        </div>

      </div>
    </>
  );
}
