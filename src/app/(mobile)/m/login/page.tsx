"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function MobileLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) router.replace("/m/chats");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setLoading(false);
    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.replace("/m/install");
  }

  return (
    <div className="nv-m-onboarding" style={{ flex: 1 }}>
      <div className="login-body">
        <div className="login-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo sm" src="/logo-noova-white.webp" alt="Noova360" />
          <h1>Ingresa a tu panel</h1>
          <p>Chats y facturación de tu negocio, en un solo lugar.</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="field">
            <label htmlFor="m-login-email">Correo</label>
            <input
              id="m-login-email"
              type="email"
              placeholder="tucorreo@negocio.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="m-login-pass">Contraseña</label>
            <input
              id="m-login-pass"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="login-foot">
          Al continuar aceptas los Términos de servicio y el Aviso de privacidad de Noova360.
        </p>
      </div>
    </div>
  );
}
