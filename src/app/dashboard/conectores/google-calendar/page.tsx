"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, CheckCircle2, ExternalLink, Info, Loader2, Unplug } from "lucide-react";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { InfoBox } from "@/components/ui/InfoBox";
import { getAuthHeaders } from "@/lib/text-agents-api";
import { btnPrimary } from "@/lib/brand-ui";

interface CalendarConnection {
  id: string;
  googleEmail: string | null;
  calendarId: string;
  status: "active" | "disconnected" | "error";
  lastError: string | null;
  updatedAt: string;
  connectionMode: "oauth" | "hosted";
  sharedWithEmail: string | null;
}

const ERROR_LABELS: Record<string, string> = {
  cancelado: "Cancelaste la conexión en Google.",
  state_invalido: "El enlace de conexión expiró o no es válido. Intenta de nuevo.",
  callback_invalido: "Google no devolvió los datos esperados. Intenta de nuevo."
};

function GoogleCalendarConectorContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [hostedEmail, setHostedEmail] = useState("");
  const [creatingHosted, setCreatingHosted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/google-calendar/status", { headers });
      const data = await res.json();
      if (res.ok) {
        setConfigured(Boolean(data.configured));
        setConnection(data.connection ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      setBanner({ kind: "success", text: "Google Calendar conectado correctamente." });
      router.replace("/dashboard/conectores/google-calendar", { scroll: false });
    } else if (error) {
      setBanner({ kind: "error", text: ERROR_LABELS[error] || `No se pudo conectar (${error}).` });
      router.replace("/dashboard/conectores/google-calendar", { scroll: false });
    }
  }, [params, router]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/google-calendar/start", { headers });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setBanner({ kind: "error", text: data.error || "No se pudo iniciar la conexión con Google." });
        setConnecting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBanner({ kind: "error", text: "Error de red al iniciar la conexión." });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/conectores/google-calendar/disconnect", { method: "POST", headers });
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleCreateHosted() {
    setCreatingHosted(true);
    setBanner(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conectores/google-calendar/hosted", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ shared_with_email: hostedEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "error", text: data.error || "No se pudo crear el calendario." });
        return;
      }
      setBanner({ kind: "success", text: `Calendario creado y compartido con ${hostedEmail.trim()}.` });
      setHostedEmail("");
      await load();
    } catch {
      setBanner({ kind: "error", text: "Error de red al crear el calendario." });
    } finally {
      setCreatingHosted(false);
    }
  }

  const isActive = connection?.status === "active";
  const isHosted = connection?.connectionMode === "hosted";

  return (
    <ChannelListPage
      title="Google Calendar"
      description="Conecta el calendario de tu empresa una sola vez. Tus agentes de texto y voz podrán consultar disponibilidad y crear citas automáticamente."
      loading={loading}
    >
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

      {!configured ? (
        <InfoBox icon={Info} layout="row" variant="neutral" className="p-6">
          Este conector aún no está configurado en el servidor (faltan las credenciales OAuth de Google
          Calendar). Contacta a soporte de Noova.
        </InfoBox>
      ) : (
        <div className="rounded-2xl border border-white/[.08] bg-noova-surface p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-[#0f7eff]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-white">Google Calendar</h2>
              {isActive ? (
                <>
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isHosted
                      ? `Conectado — calendario de Noova compartido con ${connection?.sharedWithEmail}`
                      : `Conectado — ${connection?.googleEmail || "cuenta de Google"}`}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    Tus agentes con &quot;Agendamiento&quot; activado ya pueden ofrecer horarios y crear citas en
                    este calendario. Configura las reglas de cada agente en su sección de configuración.
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Sin conectar. Ningún agente puede agendar citas todavía.
                </p>
              )}
              {connection?.status === "error" && connection.lastError && (
                <p className="text-[11px] text-red-400/80 mt-2">Último error: {connection.lastError}</p>
              )}
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-white/[.08] flex gap-2">
            {isActive ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                Desconectar
              </button>
            ) : (
              <button onClick={handleConnect} disabled={connecting} className={`${btnPrimary} py-2`}>
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Conectar con Google
              </button>
            )}
          </div>

          {!isActive && (
            <div className="mt-5 pt-5 border-t border-white/[.08]">
              <p className="text-xs font-medium text-white">¿No quieres conectar tu cuenta de Google?</p>
              <p className="text-[11px] text-gray-500 mt-1 mb-3 leading-relaxed">
                Te creamos un calendario y te lo compartimos a tu correo — te aparece en tu Google Calendar
                como uno más, sin necesidad de conectar ni volver a autorizar nada.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={hostedEmail}
                  onChange={e => setHostedEmail(e.target.value)}
                  placeholder="tu-correo@empresa.com"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-[#0f7eff]/50"
                />
                <button
                  onClick={handleCreateHosted}
                  disabled={creatingHosted || !hostedEmail.trim()}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-[#0f7eff]/15 hover:bg-[#0f7eff]/25 border border-[#0f7eff]/30 disabled:opacity-50"
                >
                  {creatingHosted ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                  Usar calendario de Noova
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </ChannelListPage>
  );
}

export default function GoogleCalendarConectorPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400 py-16">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    }>
      <GoogleCalendarConectorContent />
    </Suspense>
  );
}
