"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/telephony-api";
import { filterPipelineStages, formatLeadValue } from "@/lib/crm-record";
import { formatShortDate, initialsOf } from "../../../format";
import { AppLoader } from "../../../AppLoader";
import { StageSheet } from "../../../StageSheet";
import { BackIcon, ChevronDownIcon, WhatsAppIcon, PhoneIcon } from "../../../icons";
import type { CrmLead, CrmPipelineStage } from "@/types/crm";

const OUTCOME_LABEL: Record<string, string> = { won: "Ganado", lost: "Perdido" };

function waLink(digits: string | null): string | null {
  if (!digits) return null;
  const clean = digits.replace(/\D/g, "");
  return clean ? `https://wa.me/${clean}` : null;
}

export default function MobileLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [lead, setLead] = useState<CrmLead | null>(null);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [leadRes, stagesRes] = await Promise.all([
        authFetch(`/api/crm/leads/${id}`),
        authFetch("/api/crm/stages")
      ]);
      if (leadRes.status === 403) {
        setError("No tienes acceso al módulo de Leads.");
        return;
      }
      const leadData = await leadRes.json();
      if (!leadRes.ok || leadData.error) {
        setError(leadData.error || "No se pudo cargar el lead.");
        return;
      }
      const stagesData = await stagesRes.json();
      setLead(leadData.lead);
      setStages(Array.isArray(stagesData.stages) ? stagesData.stages : []);
      setError(null);
    } catch {
      setError("No se pudo cargar el lead.");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const pipelineStages = useMemo(() => filterPipelineStages(stages), [stages]);
  const stageIndex = useMemo(
    () => (lead ? pipelineStages.findIndex(s => s.id === lead.stage_id) : -1),
    [pipelineStages, lead]
  );

  async function moveTo(stageId: string) {
    if (!id || !lead) return;
    setMoving(true);
    setMoveError(null);
    try {
      const res = await authFetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage_id: stageId })
      });
      const data = await res.json();
      if (!res.ok) {
        setMoveError(data.error || "No se pudo mover el lead.");
        return;
      }
      setLead(data.lead);
      setSheetOpen(false);
    } finally {
      setMoving(false);
    }
  }

  if (error) {
    return (
      <div className="nv-m-onboarding" style={{ flex: 1 }}>
        <div className="onb-center">
          <p style={{ fontSize: 13.5, color: "var(--muted)" }}>{error}</p>
          <button type="button" className="btn-primary" style={{ width: "auto", padding: "10px 20px" }} onClick={() => router.push("/m/leads")}>
            Volver a Leads
          </button>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div className="loading-block">
          <AppLoader />
        </div>
      </div>
    );
  }

  const contact = lead.contact;
  const wa = contact?.actions?.whatsapp?.allowed ? waLink(contact.whatsapp) : null;
  const tel = contact?.actions?.call?.allowed ? (contact.telefono ?? contact.phone) : null;
  const lastInteraction = lead.fecha_ultima_interaccion ?? lead.updated_at;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="cv-head">
        <div className="cv-head-row">
          <button className="back-btn" aria-label="Volver a leads" onClick={() => router.push("/m/leads")}>
            <BackIcon />
          </button>
          <div className="cv-id">
            <div className="cv-title">Lead</div>
          </div>
        </div>
      </div>

      <div className="nv-m-scroll">
        <div className="det-body">
          <div className="det-hero">
            <div className="det-title">{lead.title}</div>
            <div className="det-value">{formatLeadValue(lead.value_amount, lead.currency)}</div>
          </div>

          {lead.outcome === "open" ? (
            pipelineStages.length > 0 && stageIndex >= 0 ? (
              <div className="stepper">
                {pipelineStages.map((stage, i) => (
                  <div key={stage.id} className={`step-seg${i < stageIndex ? " done" : i === stageIndex ? " now" : ""}`}>
                    <div className="step-bar" />
                    <span className="step-dot" />
                    <span className="step-lbl">{stage.name}</span>
                  </div>
                ))}
              </div>
            ) : null
          ) : (
            <span className={`temp-chip ${lead.outcome === "won" ? "frio" : "caliente"}`}>
              {OUTCOME_LABEL[lead.outcome]}
            </span>
          )}

          {contact ? (
            <div className="det-card">
              <div className="det-contact">
                <span className="det-avatar">{initialsOf(contact.name)}</span>
                <div>
                  <div className="det-contact-name">{contact.name}</div>
                  {contact.organizacion || contact.telefono ? (
                    <div className="det-contact-sub">
                      {[contact.organizacion, contact.telefono].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="det-actions">
                <a
                  className="act-btn wa"
                  href={wa ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!wa}
                  onClick={e => { if (!wa) e.preventDefault(); }}
                  style={!wa ? { opacity: 0.45, pointerEvents: "none" } : undefined}
                >
                  <WhatsAppIcon />
                  WhatsApp
                </a>
                <a
                  className="act-btn call"
                  href={tel ? `tel:${tel}` : undefined}
                  aria-disabled={!tel}
                  onClick={e => { if (!tel) e.preventDefault(); }}
                  style={!tel ? { opacity: 0.45, pointerEvents: "none" } : undefined}
                >
                  <PhoneIcon />
                  Llamar
                </a>
              </div>
            </div>
          ) : null}

          <div className="det-card">
            <div className="det-row">
              <span className="k">Etapa</span>
              {lead.outcome === "open" ? (
                <button type="button" className="stage-pill-btn" onClick={() => setSheetOpen(true)}>
                  <span className="stage-dot" style={{ backgroundColor: lead.stage?.color ?? "#5b5bf6" }} />
                  {lead.stage?.name ?? "—"}
                  <ChevronDownIcon />
                </button>
              ) : (
                <span className="v">{lead.stage?.name ?? "—"}</span>
              )}
            </div>
            {lead.temperatura ? (
              <div className="det-row">
                <span className="k">Temperatura</span>
                <span className={`temp-chip ${lead.temperatura}`}>{lead.temperatura}</span>
              </div>
            ) : null}
            {(lead.categoria_interes || lead.producto_interes) ? (
              <div className="det-row">
                <span className="k">Categoría</span>
                <span className="v">{[lead.categoria_interes, lead.producto_interes].filter(Boolean).join(" · ")}</span>
              </div>
            ) : null}
            {lead.asesor_responsable ? (
              <div className="det-row">
                <span className="k">Asesor</span>
                <span className="v">{lead.asesor_responsable}</span>
              </div>
            ) : null}
            {lastInteraction ? (
              <div className="det-row">
                <span className="k">Última interacción</span>
                <span className="v">{formatShortDate(lastInteraction)}</span>
              </div>
            ) : null}
          </div>

          {lead.notes ? (
            <div className="det-card">
              <div className="det-section-label">Notas</div>
              <div className="det-notes">{lead.notes}</div>
            </div>
          ) : null}

          {lead.inbox_conversation_id ? (
            <button
              type="button"
              className="det-link"
              onClick={() => router.push(`/m/chats/${lead.inbox_conversation_id}`)}
            >
              Ver conversación en Chats →
            </button>
          ) : null}
        </div>
      </div>

      {sheetOpen ? (
        <StageSheet
          stages={pipelineStages}
          currentStageId={lead.stage_id}
          leadTitle={lead.title}
          saving={moving}
          error={moveError}
          onSelect={moveTo}
          onClose={() => { setSheetOpen(false); setMoveError(null); }}
        />
      ) : null}
    </div>
  );
}
