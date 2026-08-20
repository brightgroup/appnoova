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
  Webhook,
  Save
} from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/telephony-api";
import { tabActive, tabIdle, btnPrimarySm, modalInput } from "@/lib/brand-ui";
import { Badge } from "@/components/ui/Badge";
import { AutomationEventsTable, type AutomationEventRow } from "@/components/automations/AutomationEventsTable";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";

type Tab = "vista-general" | "autenticacion" | "registros";

const TABS: { id: Tab; label: string }[] = [
  { id: "vista-general", label: "Vista general" },
  { id: "autenticacion", label: "Autenticación" },
  { id: "registros", label: "Registros" }
];

function parseTab(value: string | undefined): Tab {
  return TABS.some(t => t.id === value) ? (value as Tab) : "vista-general";
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
  const [savingWebhookUrl, setSavingWebhookUrl] = useState(false);
  const [webhookUrlError, setWebhookUrlError] = useState("");

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

  async function saveWebhookUrl(webhookUrl: string) {
    setSavingWebhookUrl(true);
    setWebhookUrlError("");
    setTestResult(null);
    const res = await authFetch(`/api/automations/connections/${connectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ webhookUrl })
    });
    const json = await res.json();
    setSavingWebhookUrl(false);
    if (!res.ok) {
      setWebhookUrlError(json.error ?? "No se pudo guardar la URL");
      return false;
    }
    setConnection(json.connection);
    return true;
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
        <Link href="/dashboard/conectores" className="text-[#0f7eff] hover:underline">Volver a Conectores</Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-noova-main text-gray-100 min-h-0 overflow-hidden">
      <div className="border-b border-white/[.08] px-6 py-4 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard/conectores" className="p-1.5 hover:bg-white/[.08] rounded-lg text-gray-400 hover:text-white shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-white/[.08] flex items-center justify-center shrink-0">
            <Webhook className="w-[18px] h-[18px] text-gray-300" />
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
        {activeTab === "vista-general" && (
          <VistaGeneralTab
            connection={connection}
            events={events}
            saving={savingWebhookUrl}
            error={webhookUrlError}
            onSaveWebhookUrl={saveWebhookUrl}
          />
        )}
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
        {activeTab === "registros" && <AutomationEventsTable events={events} />}
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
  events,
  saving,
  error,
  onSaveWebhookUrl
}: {
  connection: AutomationConnectionRecord;
  events: AutomationEventRow[];
  saving: boolean;
  error: string;
  onSaveWebhookUrl: (url: string) => Promise<boolean>;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  async function copyText(field: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(prev => (prev === field ? null : prev)), 1800);
  }

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = events.filter(e => new Date(e.created_at).getTime() >= dayAgo);
  const sent = recent.filter(e => e.status === "sent" || e.status === "responded" || e.status === "error");
  const ok = recent.filter(e => e.status === "sent" || e.status === "responded");
  const successRate = sent.length > 0 ? Math.round((ok.length / sent.length) * 100) : null;
  const recentErrors = events.filter(e => e.status === "error").slice(0, 5);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-white mb-1">URL del webhook</h4>
        <p className="text-xs text-gray-500 mb-3">Noova envía cada evento aquí — este conector solo maneja la salida.</p>
        <EditableUrlField
          value={connection.webhookUrl}
          field="webhook"
          placeholder="https://tu-instancia.n8n.cloud/webhook/…"
          copiedField={copiedField}
          saving={saving}
          error={error}
          onCopy={copyText}
          onSave={onSaveWebhookUrl}
        />
      </div>

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
        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Firma / API key</label>
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
          Noova la manda de dos formas en cada envío, usa la que te sea más fácil de configurar:
        </p>
        <ul className="text-[11px] text-gray-500 mt-1.5 space-y-1 leading-relaxed list-disc list-inside">
          <li>
            Como API key plana en el header{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded text-gray-300">X-Noova-Api-Key</code> — pégala en una
            credencial &ldquo;Header Auth&rdquo; de n8n, sin escribir código.
          </li>
          <li>
            Como firma HMAC-SHA256 en{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded text-gray-300">X-Noova-Signature</code> — para quien
            quiera verificar criptográficamente que el cuerpo no fue alterado.
          </li>
        </ul>
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


function EditableUrlField({
  value,
  field,
  placeholder,
  copiedField,
  saving,
  error,
  onCopy,
  onSave
}: {
  value: string;
  field: string;
  placeholder?: string;
  copiedField: string | null;
  saving: boolean;
  error: string;
  onCopy: (field: string, value: string) => void;
  onSave: (url: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = draft.trim() !== value;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          className={`${modalInput} font-mono text-xs min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => onCopy(field, draft.trim() || value)}
          className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] border border-white/[.08]"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
      {dirty && (
        <button
          type="button"
          onClick={() => void onSave(draft.trim())}
          disabled={saving || !draft.trim()}
          className={`${btnPrimarySm} mt-2`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Guardar URL
        </button>
      )}
      {copiedField === field && <p className="text-[11px] text-emerald-400 mt-1.5">Copiado.</p>}
      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}
