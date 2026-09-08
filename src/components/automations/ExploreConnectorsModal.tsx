"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Check, Loader2, Webhook, Mail, Shield } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { GoogleCalendarLogo } from "@/components/icons/brands/GoogleCalendarLogo";
import { HubSpotLogo } from "@/components/icons/brands/HubSpotLogo";
import { Badge } from "@/components/ui/Badge";
import { CollapsibleGroup } from "@/components/ui/CollapsibleGroup";
import { InsurerConnectorRow } from "@/components/automations/InsurerConnectorRow";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface ExploreConnectorsModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama con el id de la conexión recién creada. */
  onConnected: (connectionId: string) => void;
  /** Muestra el grupo "Aseguradoras" (La Equidad y las que se sumen) y Softseguros — solo cuando la org tiene el módulo Noova Seguros. */
  showAseguradoras?: boolean;
}

type Step = "grid" | { form: { defaultName: string } };

interface ConnectorEntry {
  key: string;
  searchTerms: string;
  render: () => React.ReactNode;
}

export function ExploreConnectorsModal({
  open,
  onClose,
  onConnected,
  showAseguradoras = false
}: ExploreConnectorsModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("grid");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const reset = useCallback(() => {
    setStep("grid");
    setSearch("");
    setName("");
    setWebhookUrl("");
    setFormError("");
    setNotice("");
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const entries = useMemo<ConnectorEntry[]>(() => {
    const list: ConnectorEntry[] = [];

    if (showAseguradoras) {
      list.push({
        key: "aseguradoras",
        searchTerms: "aseguradoras la equidad seguros",
        render: () => (
          <CollapsibleGroup
            key="aseguradoras"
            icon={<Shield className="w-5 h-5 text-[#6f95f2]" />}
            iconBg="bg-[#2463eb]/15"
            name="Aseguradoras"
            publisher="Por Noova · Seguros"
            description="Cada corredor conecta sus propias credenciales por aseguradora."
          >
            <InsurerConnectorRow providerKey="la_equidad" letters="LE" name="La Equidad Seguros" />
          </CollapsibleGroup>
        )
      });
      list.push({
        key: "softseguros",
        searchTerms: "softseguros seguros cartera pólizas",
        render: () => (
          <CollapsibleGroup
            key="softseguros"
            icon={<span className="text-xs font-bold text-[#6f95f2]">SS</span>}
            iconBg="bg-[#2463eb]/15"
            name="Softseguros"
            publisher="Por Noova · Seguros"
            description="Lee tu cartera de pólizas directo desde Softseguros."
          >
            <InsurerConnectorRow providerKey="softseguros" letters="SS" name="Softseguros" />
          </CollapsibleGroup>
        )
      });
    }

    list.push({
      key: "google-calendar",
      searchTerms: "google calendar calendario agenda",
      render: () => (
        <ConnectorCard
          key="google-calendar"
          icon={<GoogleCalendarLogo className="w-5 h-5 text-[#4285f4]" />}
          iconBg="bg-[#4285f4]/15"
          name="Google Calendar"
          description="Agenda citas directo desde la conversación."
          connected={false}
          onConnect={() => {
            close();
            router.push("/dashboard/conectores/google-calendar");
          }}
        />
      )
    });

    list.push({
      key: "hubspot",
      searchTerms: "hubspot crm",
      render: () => (
        <ConnectorCard
          key="hubspot"
          icon={<HubSpotLogo className="w-5 h-5 text-[#ff7a59]" />}
          iconBg="bg-[#ff7a59]/15"
          name="HubSpot"
          description="Automatiza acciones sobre tus conversaciones."
          connected={false}
          onConnect={() => {
            close();
            router.push("/dashboard/conectores/hubspot");
          }}
        />
      )
    });

    list.push({
      key: "gmail",
      searchTerms: "gmail correo email",
      render: () => (
        <ConnectorCard
          key="gmail"
          icon={<Mail className="w-5 h-5 text-[#ea4335]" />}
          iconBg="bg-[#ea4335]/15"
          name="Gmail"
          description="Lee y responde correos de tus clientes."
          comingSoon
          onNotify={() => setNotice("Te avisamos cuando esté listo.")}
        />
      )
    });

    list.push({
      key: "webhook",
      searchTerms: "webhook propio n8n zapier automatización",
      render: () => (
        <ConnectorCard
          key="webhook"
          icon={<Webhook className="w-5 h-5 text-gray-300" />}
          iconBg="bg-white/[.08]"
          name="Webhook propio"
          description="Conecta cualquier sistema propio con una URL y un secreto."
          connected={false}
          onConnect={() => openForm("")}
        />
      )
    });

    return list;
  }, [showAseguradoras, router, close]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => e.searchTerms.includes(q));
  }, [entries, search]);

  if (!open) return null;

  function openForm(defaultName: string) {
    setName(defaultName);
    setWebhookUrl("");
    setFormError("");
    setStep({ form: { defaultName } });
  }

  async function submitForm() {
    if (!name.trim()) {
      setFormError("Ponle un nombre a la conexión.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await authFetch("/api/automations/connections", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), webhookUrl: webhookUrl.trim() })
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error ?? "No se pudo crear el conector");
        return;
      }
      onConnected(json.connection.id);
      reset();
    } catch {
      setFormError("Error de red al crear el conector.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[86vh] rounded-2xl border border-white/[.12] bg-noova-surface shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 px-6 py-5 border-b border-white/[.08] flex items-center justify-between">
          <h3 className="text-base font-bold text-white">
            {typeof step === "object" ? "Conectar" : "Conectores"}
          </h3>
          <button
            type="button"
            onClick={close}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/[.08] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "grid" ? (
          <>
            <div className="shrink-0 px-6 py-4 border-b border-white/[.08] flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/[.08] focus-within:border-[#0f7eff]/50">
                <Search className="w-4 h-4 text-gray-500 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar conectores…"
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {filteredEntries.length} conector{filteredEntries.length === 1 ? "" : "es"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
              {filteredEntries.length === 0 ? (
                <p className="sm:col-span-2 text-center text-sm text-gray-500 py-10">
                  Ningún conector coincide con &quot;{search}&quot;.
                </p>
              ) : (
                filteredEntries.map(e => e.render())
              )}
            </div>

            {notice && (
              <div className="shrink-0 px-6 py-3 border-t border-white/[.08] text-xs text-emerald-400 flex items-center gap-2">
                <Check className="w-3.5 h-3.5" /> {notice}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Noova generará un secreto para firmar cada envío — lo verás en la pantalla del conector apenas
              lo crees.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="n8n · Qbit"
                  className={modalInput}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">URL del webhook</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://tu-instancia.n8n.cloud/webhook/…"
                  className={`${modalInput} font-mono`}
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  La URL del disparador que ya tengas armado en tu flujo. La firma secreta te la damos
                  nosotros al crear la conexión.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setStep("grid")} className={btnGhost}>
                Atrás
              </button>
              <button
                type="button"
                onClick={submitForm}
                disabled={submitting}
                className={`${btnPrimary} flex-1 justify-center gap-2`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Crear conexión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorCard({
  icon,
  iconBg,
  name,
  description,
  connected,
  comingSoon,
  onConnect,
  onNotify
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  connected?: boolean;
  comingSoon?: boolean;
  onConnect?: () => void;
  onNotify?: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[.08] bg-black/20 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">{name}</p>
        <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        {comingSoon ? (
          <div className="flex items-center gap-2">
            <Badge variant="neutral">Próximamente</Badge>
            <button type="button" onClick={onNotify} className={btnGhost}>
              Avísame
            </button>
          </div>
        ) : connected ? (
          <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            className="w-7 h-7 rounded-full bg-white/[.08] hover:bg-[#0f7eff]/20 hover:text-[#99c9ff] flex items-center justify-center text-gray-300 transition-colors text-lg leading-none"
            title="Conectar"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
