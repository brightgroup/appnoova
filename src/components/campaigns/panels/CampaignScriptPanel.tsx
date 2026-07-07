"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Link2, Link2Off, RefreshCw, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { CampaignPromptEditor } from "@/components/campaigns/CampaignPromptEditor";
import { VOICE_BUSINESS_PROMPT_GUIDE } from "@/lib/elevenlabs/voice-business-prompt";
import { campaignVariables, buildRowVariables } from "@/lib/campaigns/render-prompt";
import type { VoiceCampaignRecord } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

interface CampaignScriptPanelProps {
  campaign: VoiceCampaignRecord;
  onChange: (patch: Partial<VoiceCampaignRecord>) => void;
}

export function CampaignScriptPanel({ campaign, onChange }: CampaignScriptPanelProps) {
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentName, setAgentName] = useState("");
  const [columns, setColumns] = useState<DataTableColumn[]>([]);
  const [sampleRow, setSampleRow] = useState<Record<string, string | number | boolean | null> | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [audienceRes, agentRes] = await Promise.all([
      campaign.audience_table_id
        ? authFetch(`/api/campaigns/${campaign.id}/audience-rows`)
        : Promise.resolve(null),
      campaign.voice_agent_id
        ? authFetch(`/api/voice/agents?id=${campaign.voice_agent_id}`)
        : Promise.resolve(null),
    ]);

    if (audienceRes) {
      const json = await audienceRes.json();
      if (audienceRes.ok) {
        setColumns(json.table?.columns ?? []);
        if (Array.isArray(json.rows) && json.rows.length > 0) {
          setSampleRow(json.rows[0].data ?? null);
        }
      }
    }
    if (agentRes) {
      const json = await agentRes.json();
      if (agentRes.ok && json.agent) {
        setAgentPrompt(json.agent.prompt ?? "");
        setAgentName(json.agent.name ?? "");
      }
    }
    setLoading(false);
  }, [campaign.id, campaign.audience_table_id, campaign.voice_agent_id]);

  useEffect(() => {
    void load();
  }, [load]);

  const linked = !campaign.prompt_template?.trim();
  const agentChanged =
    !linked && !!agentPrompt && agentPrompt.trim() !== (campaign.prompt_template ?? "").trim();

  const variables = useMemo(
    () => campaignVariables(campaign.field_mapping),
    [campaign.field_mapping]
  );

  const sampleValues = useMemo(() => {
    if (!sampleRow) return undefined;
    return buildRowVariables(sampleRow, campaign.field_mapping, columns);
  }, [sampleRow, campaign.field_mapping, columns]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Agente y guion</h2>
          <p className="text-xs text-gray-500">
            {campaign.voice_agent_id
              ? `Agente: ${agentName || "—"}. `
              : "Sin agente asignado. "}
            Las variables se reemplazan con los datos de cada contacto en la llamada.
          </p>
          <p className="text-xs text-[#a5a5ff]/80 mt-2">{VOICE_BUSINESS_PROMPT_GUIDE}</p>
        </div>

        {!campaign.voice_agent_id ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            Asigna un agente en la pestaña <b>General</b> para definir el guion.
          </div>
        ) : linked ? (
          <>
            <div className="p-3 rounded-xl bg-[#5b5bf6]/10 border border-[#5b5bf6]/25 text-xs text-[#c9c9ff] flex items-start gap-2">
              <Link2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-white">Sincronizado con el agente</p>
                <p className="text-[#a5a5ff]/80">
                  Este guion usa el prompt del agente. Cualquier cambio que hagas en el agente se
                  reflejará automáticamente en la campaña.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ prompt_template: agentPrompt })}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#5b5bf6]/30 bg-[#5b5bf6]/15 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#5b5bf6]/25"
              >
                <Link2Off className="w-3.5 h-3.5" /> Personalizar
              </button>
            </div>
            <div className="rounded-xl border border-white/[.08] bg-white/[.02] p-4 max-h-[420px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs text-gray-300 font-mono leading-relaxed">
                {agentPrompt || "El agente no tiene prompt configurado."}
              </pre>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/[.04] border border-white/[.08] px-2.5 py-1.5 text-[11px] text-gray-300">
                <Link2Off className="w-3.5 h-3.5 text-amber-400" /> Guion personalizado (no se
                sincroniza)
              </div>
              <button
                type="button"
                onClick={() => onChange({ prompt_template: null })}
                className="inline-flex items-center gap-1.5 text-[11px] text-[#a5a5ff] hover:text-white"
              >
                <Link2 className="w-3.5 h-3.5" /> Volver a sincronizar con el agente
              </button>
            </div>

            {agentChanged && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  El prompt del agente cambió desde que personalizaste este guion.
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ prompt_template: agentPrompt })}
                  className="shrink-0 underline hover:text-white"
                >
                  Traer prompt del agente
                </button>
              </div>
            )}

            <CampaignPromptEditor
              value={campaign.prompt_template ?? ""}
              onChange={prompt_template => onChange({ prompt_template })}
              variables={variables}
              sampleValues={sampleValues}
            />
          </>
        )}
      </div>
    </div>
  );
}
