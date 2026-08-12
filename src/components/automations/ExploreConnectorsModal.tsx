"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Check, Loader2, Webhook, Plus } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { GoogleCalendarLogo } from "@/components/icons/brands/GoogleCalendarLogo";
import { HubSpotLogo } from "@/components/icons/brands/HubSpotLogo";
import { Badge } from "@/components/ui/Badge";
import { btnPrimary, btnGhost, modalInput } from "@/lib/brand-ui";

interface ExploreConnectorsModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama con el id de la conexión recién creada. */
  onConnected: (connectionId: string) => void;
}

type Step = "grid" | { form: { defaultName: string } };

export function ExploreConnectorsModal({ open, onClose, onConnected }: ExploreConnectorsModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("grid");
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  if (!open) return null;

  function reset() {
    setStep("grid");
    setName("");
    setWebhookUrl("");
    setFormError("");
    setNotice("");
  }

  function close() {
    reset();
    onClose();
  }

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
        <div className="shrink-0 bg-gradient-to-r from-[#5b5bf6] to-[#7070f8] px-6 py-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {typeof step === "object" ? "Conectar" : "Explorar conectores"}
          </h3>
          <button
            type="button"
            onClick={close}
            className="w-8 h-8 rounded-lg bg-white/[.16] hover:bg-white/[.26] flex items-center justify-center text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "grid" ? (
          <>
            <div className="shrink-0 px-6 py-4 border-b border-white/[.08] flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/20 border border-white/[.08]">
                <Search className="w-4 h-4 text-gray-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar conectores…"
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-gray-500"
                />
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">4 conectores</span>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ConnectorCard
                icon={<GoogleCalendarLogo className="w-5 h-5 text-[#4285f4]" />}
                iconBg="bg-[#4285f4]/15"
                name="Google Calendar"
                publisher="Por Noova · Calendario"
                description="Conecta tu calendario de Google para agendar citas directo desde la conversación."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.push("/dashboard/conectores/google-calendar");
                    }}
                    className={`${btnPrimary} !px-3 !py-1.5 !text-xs gap-1.5`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Conectar
                  </button>
                }
              />
              <ConnectorCard
                icon={<HubSpotLogo className="w-5 h-5 text-[#ff7a59]" />}
                iconBg="bg-[#ff7a59]/15"
                name="HubSpot"
                publisher="Por Noova · CRM"
                description="Sincroniza contactos, negocios y notas automáticamente con tu CRM."
                action={
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">Próximamente</Badge>
                    <button
                      type="button"
                      onClick={() => setNotice("Te avisamos cuando esté listo.")}
                      className={`${btnGhost}`}
                    >
                      Avísame
                    </button>
                  </div>
                }
              />
              <ConnectorCard
                icon={<span className="text-xs font-bold text-[#6f95f2]">SS</span>}
                iconBg="bg-[#2463eb]/15"
                name="Softseguros"
                publisher="Por Noova · Seguros"
                description="Conecta cotizaciones y pólizas directo desde la conversación."
                action={
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">Próximamente</Badge>
                    <button
                      type="button"
                      onClick={() => setNotice("Te avisamos cuando esté listo.")}
                      className={`${btnGhost}`}
                    >
                      Avísame
                    </button>
                  </div>
                }
              />
              <ConnectorCard
                icon={<Webhook className="w-5 h-5 text-gray-300" />}
                iconBg="bg-white/[.08]"
                name="Webhook propio"
                publisher="Por Noova · Automatización"
                description="Conecta cualquier sistema propio o de terceros con una URL y un secreto."
                action={
                  <button type="button" onClick={() => openForm("")} className={`${btnPrimary} !px-3 !py-1.5 !text-xs gap-1.5`}>
                    <Plus className="w-3.5 h-3.5" /> Conectar
                  </button>
                }
              />
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
  publisher,
  description,
  action
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  publisher: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[.08] bg-black/20 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{name}</p>
          <p className="text-[11px] text-gray-500">{publisher}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
      <div className="mt-auto pt-1">{action}</div>
    </div>
  );
}
