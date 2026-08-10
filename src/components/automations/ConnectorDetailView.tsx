"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Unplug,
  CheckCircle2,
  AlertTriangle,
  Webhook
} from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import { tabActive, tabIdle } from "@/lib/brand-ui";
import { Badge } from "@/components/ui/Badge";
import { N8nLogo } from "@/components/icons/brands/N8nLogo";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";

type Tab = "vista-general" | "autenticacion" | "registros" | "webhooks";

const TABS: { id: Tab; label: string }[] = [
  { id: "vista-general", label: "Vista general" },
  { id: "autenticacion", label: "Autenticación" },
  { id: "registros", label: "Registros" },
  { id: "webhooks", label: "Webhooks" }
];

function parseTab(value: string | undefined): Tab {
  return TABS.some(t => t.id === value) ? (value as Tab) : "vista-general";
}

interface AutomationEventRow {
  id: string;
  event_type: string;
  status: "sent" | "responded" | "no_response" | "error";
  http_status: number | null;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export function ConnectorDetailView({
  connectionId,
  initialTab
}: {
  connectionId: string;
  initialTab?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(parseTab(initialTab));
  const [connection, setConnection] = useState<AutomationConnectionRecord | null>(null);
  const [events, setEvents] = useState<AutomationEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [secret, setSecret] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretLoading, setSecretLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const setTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      router.replace(`/dashboard/conectores/${connectionId}?tab=${tab}`, { scroll: false });
    },
    [router, connectionId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [connRes, eventsRes] = await Promise.all([
      authFetch(`/api/automations/connections/${connectionId}`),
      authFetch(`/api/automations/connections/${connectionId}/events`)
    ]);
    const connJson = await connRes.json();
    if (!connRes.ok) {
      setError(connJson.error ?? "No se pudo cargar el conector");
      setLoading(false);
      return;
    }
    setConnection(connJson.connection);
    if (eventsRes.ok) {
      const eventsJson = await eventsRes.json();
      setEvents(eventsJson.events ?? []);
    }
    setLoading(false);
  }, [connectionId]);

  useEffect(() => { void load(); }, [load]);

  async function copyText(field: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 1800);
  }

  async function revealSecret() {
    if (secret) {
      setSecretVisible(v => !v);
      return;
    }
    setSecretLoading(true);
    const res = await authFetch(`/api/automations/connections/${connectionId}/secret`);
    const json = await res.json();
    setSecretLoading(false);
    if (res.ok) {
      setSecret(json.secret);
      setSecretVisible(true);
    }
  }

  async function regenerateSecret() {
    if (!confirm("¿Regenerar la firma secreta? El conector externo dejará de poder verificar los envíos hasta que actualices la firma allá.")) return;
    setRegenerating(true);
    const res = await authFetch(`/api/automations/connections/${connectionId}/regenerate-secret`, { method: "POST" });
    const json = await res.json();
    setRegenerating(false);
    if (res.ok) {
      setSecret(json.secret);
      setSecretVisible(true);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const res = await authFetch(`/api/automations/connections/${connectionId}/test`, { method: "POST" });
    const json = await res.json();
    setTesting(false);
    setTestResult({
      ok: Boolean(json.ok),
      message: json.ok
        ? `Respondió 200 OK en ${json.latencyMs} ms`
        : json.error ?? `HTTP ${json.httpStatus ?? "?"}`
    });
    void load();
  }

  async function disconnect() {
    if (!confirm("¿Desconectar este conector? Los workflows que lo usan dejarán de enviar eventos.")) return;
    setDisconnecting(true);
    await authFetch(`/api/automations/connections/${connectionId}/disconnect`, { method: "POST" });
    setDisconnecting(false);
    router.push("/dashboard/conectores");
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-noova-main text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando conector…
      </div>
    );
  }

  if (error || !connection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-noova-main text-gray-400 text-sm gap-3">
        <p>{error || "Conector no encontrado"}</p>
        <Link href="/dashboard/conectores" className="text-[#5b5bf6] hover:underline">Volver a Conectores</Link>
      </div>
    );
  }

  const callbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/automations/inbound/${connection.inboundToken}`;

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/conectores" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-[#ea4b71]/15 flex items-center justify-center shrink-0">
            <N8nLogo className="w-[18px] h-[18px] text-[#ea4b71]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold truncate">{connection.name}</h1>
              <StatusBadge status={connection.status} />
            </div>
            <p className="text-xs text-gray-400 truncate">
              {new URL(connection.webhookUrl).host}
              {connection.lastTestedAt && ` · última prueba ${new Date(connection.lastTestedAt).toLocaleString("es-CO")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-sm text-white hover:bg-white/[.08] disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Probar conexión
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
          >
            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
            Desconectar
          </button>
        </div>
      </div>

      <div className="border-b border-white/[.08] px-6 flex gap-1 overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id ? tabActive : tabIdle
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {testResult && (
        <div
          className={`mx-6 mt-4 p-3 rounded-xl text-xs border shrink-0 ${
            testResult.ok
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {activeTab === "vista-general" && <VistaGeneralTab connection={connection} events={events} />}
        {activeTab === "autenticacion" && (
          <AutenticacionTab
            secret={secret}
            secretVisible={secretVisible}
            secretLoading={secretLoading}
            regenerating={regenerating}
            copiedField={copiedField}
            onReveal={() => void revealSecret()}
            onRegenerate={() => void regenerateSecret()}
            onCopy={copyText}
          />
        )}
        {activeTab === "registros" && <RegistrosTab events={events} />}
        {activeTab === "webhooks" && (
          <WebhooksTab
            webhookUrl={connection.webhookUrl}
            callbackUrl={callbackUrl}
            copiedField={copiedField}
            onCopy={copyText}
          />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AutomationConnectionRecord["status"] }) {
  if (status === "active") return <Badge variant="emerald" icon={CheckCircle2}>Conectado</Badge>;
  if (status === "error") return <Badge variant="danger" icon={AlertTriangle}>Error</Badge>;
  return <Badge variant="neutral">Desconectado</Badge>;
}

function VistaGeneralTab({
  connection,
  events
}: {
  connection: AutomationConnectionRecord;
  events: AutomationEventRow[];
}) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.created_at).getTime() >= dayAgo);
  const sent = recent.filter(e => e.status === "sent" || e.status === "responded" || e.status === "error");
  const ok = recent.filter(e => e.status === "sent" || e.status === "responded");
  const successRate = sent.length > 0 ? Math.round((ok.length / sent.length) * 100) : null;
  const recentErrors = events.filter(e => e.status === "error").slice(0, 5);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
          <p className="text-xs text-gray-400 mb-1">Envíos · últimas 24 h</p>
          <p className="text-2xl font-bold tabular-nums">{sent.length}</p>
        </div>
        <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
          <p className="text-xs text-gray-400 mb-1">Tasa de éxito · 24 h</p>
          <p className="text-2xl font-bold tabular-nums">{successRate === null ? "—" : `${successRate}%`}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-5">
        <p className="text-sm font-semibold text-white mb-3">Errores recientes</p>
        {recentErrors.length === 0 ? (
          <p className="text-xs text-gray-500">Sin errores registrados.</p>
        ) : (
          <div className="space-y-2">
            {recentErrors.map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-red-400 truncate">{e.error_message ?? "Error desconocido"}</span>
                <span className="text-gray-500 shrink-0 ml-3">{new Date(e.created_at).toLocaleString("es-CO")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AutenticacionTab({
  secret,
  secretVisible,
  secretLoading,
  regenerating,
  copiedField,
  onReveal,
  onRegenerate,
  onCopy
}: {
  secret: string | null;
  secretVisible: boolean;
  secretLoading: boolean;
  regenerating: boolean;
  copiedField: string | null;
  onReveal: () => void;
  onRegenerate: () => void;
  onCopy: (field: string, value: string) => void;
}) {
  const displayValue = secretVisible && secret ? secret : "••••••••••••••••••••••••••••";

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Firma secreta</label>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs font-mono text-white truncate">
            {displayValue}
          </div>
          <button
            type="button"
            onClick={onReveal}
            disabled={secretLoading}
            className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] border border-white/[.08]"
          >
            {secretLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : secretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => secret && onCopy("secret", secret)}
            disabled={!secret}
            className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] border border-white/[.08] disabled:opacity-40"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copiedField === "secret" && <p className="text-[11px] text-emerald-400 mt-1.5">Copiado.</p>}
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Va en el header <code className="bg-black/30 px-1 py-0.5 rounded text-gray-300">X-Noova-Signature</code> de
          cada envío (HMAC-SHA256), para que tu flujo verifique que viene de Noova.
        </p>
      </div>

      <button
        type="button"
        onClick={onRegenerate}
        disabled={regenerating}
        className="inline-flex items-center gap-2 rounded-lg border border-white/[.12] bg-white/[.04] px-3 py-2 text-xs text-white hover:bg-white/[.08] disabled:opacity-50"
      >
        {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Regenerar firma
      </button>
    </div>
  );
}

function RegistrosTab({ events }: { events: AutomationEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 py-10 text-center">Sin actividad todavía.</p>;
  }
  return (
    <div className="rounded-xl border border-white/[.08] overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-white/[.03]">
          <tr className="border-b border-white/[.08]">
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Evento</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Estado</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Latencia</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wide text-[11px] text-gray-400">Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id} className="border-b border-white/[.06] last:border-0 hover:bg-white/[.03]">
              <td className="px-4 py-3 text-gray-200">{e.event_type}</td>
              <td className="px-4 py-3"><EventStatusBadge status={e.status} /></td>
              <td className="px-4 py-3 text-gray-400 tabular-nums">{e.latency_ms ? `${(e.latency_ms / 1000).toFixed(1)} s` : "—"}</td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-CO")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventStatusBadge({ status }: { status: AutomationEventRow["status"] }) {
  if (status === "sent" || status === "responded") return <Badge variant="emerald" icon={CheckCircle2}>Respuesta recibida</Badge>;
  if (status === "error") return <Badge variant="danger">Sin conexión</Badge>;
  return <Badge variant="neutral">Sin respuesta aún</Badge>;
}

function WebhooksTab({
  webhookUrl,
  callbackUrl,
  copiedField,
  onCopy
}: {
  webhookUrl: string;
  callbackUrl: string;
  copiedField: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
      <div>
        <h4 className="text-sm font-semibold text-white mb-1">Salida — Noova envía a tu flujo</h4>
        <p className="text-xs text-gray-500 mb-3">La URL del webhook que dispara tu flujo.</p>
        <UrlField value={webhookUrl} field="webhook" copiedField={copiedField} onCopy={onCopy} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-white mb-1 flex items-center gap-1.5">
          <Webhook className="w-3.5 h-3.5 text-gray-400" /> Entrada — tu flujo responde a Noova
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          Generada por Noova. Pégala como último paso HTTP Request de tu flujo.
        </p>
        <UrlField value={callbackUrl} field="callback" copiedField={copiedField} onCopy={onCopy} />
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Cuando tu flujo llame a esta URL con la respuesta, Noova la envía por WhatsApp al cliente final —
          en el mismo chat.
        </p>
      </div>
    </div>
  );
}

function UrlField({
  value,
  field,
  copiedField,
  onCopy
}: {
  value: string;
  field: string;
  copiedField: string | null;
  onCopy: (field: string, value: string) => void;
}) {
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] text-xs font-mono text-white truncate">
          {value}
        </div>
        <button
          type="button"
          onClick={() => onCopy(field, value)}
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] border border-white/[.08]"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
      {copiedField === field && <p className="text-[11px] text-emerald-400 mt-1.5">Copiado.</p>}
    </div>
  );
}
