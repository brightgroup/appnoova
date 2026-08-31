import { adminClient } from "@/lib/voice-agents-server";
import { getOriApiKey } from "@/lib/google-ai";
import { runInternalJsonPrompt } from "@/lib/llm/internal-json-prompt";
import { recordUsageSafe } from "@/lib/billing/meter";
import { toVoiceCampaignRecord } from "@/lib/campaigns/record";
import { primaryOutputField } from "@/lib/campaigns/output-fields";
import { parseSupresiones } from "@/lib/crm-contactability";
import type { CampaignOutputField, VoiceCampaignRecord } from "@/types/voice-campaign";
import type { TranscriptEntry } from "@/types/voice-agent-call";

type CellValue = string | number | boolean | null;

const OPT_OUT_KEY = "__no_volver_a_llamar";

const CAPTURE_SYSTEM = `Eres un analista que extrae datos estructurados de llamadas comerciales (español).
Responde SOLO JSON válido con la forma { "campos": { "<key>": <valor> }, "no_volver_a_llamar": true|false }.
Reglas:
- Usa exclusivamente lo dicho en la conversación. Si un dato no se mencionó, omite la key (no inventes).
- Los campos obligatorios SIEMPRE deben aparecer en "campos".
- La tipificación principal (campo is_primary) refleja el RESULTADO COMERCIAL, no problemas técnicos.
- Problemas de comunicación, "no se escuchó", cortes o "aló" repetidos NO son una tipificación: clasifica según el interés comercial real.
- Si solo hubo saludo/confirmación de identidad sin desarrollar el motivo de la llamada → tipificación "No interesado".
- Si el cliente mostró interés, pidió información, agendó o aceptó seguimiento → tipificación "Interesado".
- Para campos tipo lista, responde EXACTAMENTE una de las opciones dadas.
- En campos de resumen/texto: prioriza motivo de la llamada y resultado comercial; los problemas de audio van al final en una frase breve, no como tema principal.
- Booleanos: true/false. Fechas: YYYY-MM-DD. Horas: HH:MM (24h). Números: sin texto.
- "no_volver_a_llamar" es true SOLO si la persona pidió explícitamente que no la vuelvan a llamar o que la eliminen de la lista.`;

function transcriptToText(transcript: TranscriptEntry[]): string {
  return transcript
    .filter(t => t.text?.trim())
    .map(t => `${t.role === "user" ? "Cliente" : "Agente"}: ${t.text.trim()}`)
    .join("\n");
}

function fieldSpecLines(fields: CampaignOutputField[]): string {
  return fields
    .map(f => {
      const opts = f.field_type === "select" ? ` Opciones: [${f.options.join(" | ")}]` : "";
      const req = f.required || f.is_primary ? " OBLIGATORIO." : "";
      const primary = f.is_primary ? " Es la TIPIFICACIÓN PRINCIPAL (resultado comercial)." : "";
      return `- key: "${f.key}" · tipo: ${f.field_type} · nombre: "${f.label}".${opts}${req}${primary} Instrucción: ${f.ai_instruction}`;
    })
    .join("\n");
}

const INTEREST_HINTS =
  /\b(interesad|cotiz|informaci[oó]n|agend|visita|demo|compr|financ|modelo|veh[ií]culo|carro|suv|precio|asesor|env[ií]e|foto|ficha|seguimiento)\b/i;
const NO_INTEREST_HINTS =
  /\b(no interes|no me interesa|no llam|ocupad|ahora no|m[aá]s adelante sin|finca ra[ií]z|no quiero|basta|retir)\b/i;

/** Infiere tipificación principal si la IA no la devolvió. */
function inferPrimaryValue(
  primary: CampaignOutputField,
  dialogue: string,
  captured: Record<string, unknown>,
  optOut: boolean
): string | null {
  if (primary.field_type !== "select" || primary.options.length === 0) return null;
  const notInterested =
    primary.options.find(o => /no interes/i.test(o)) ?? primary.options[primary.options.length - 1];
  const interested = primary.options.find(o => /interes/i.test(o) && !/no interes/i.test(o));

  if (optOut) return notInterested;

  const resumen = String(captured.r ?? captured.resumen ?? "").toLowerCase();
  const text = `${dialogue}\n${resumen}`.toLowerCase();

  if (NO_INTEREST_HINTS.test(text) && !INTEREST_HINTS.test(text)) return notInterested;
  if (INTEREST_HINTS.test(text) && interested) return interested;

  const userLines = dialogue
    .split("\n")
    .filter(l => l.startsWith("Cliente:"))
    .map(l => l.slice("Cliente:".length).trim())
    .filter(Boolean);
  if (userLines.length <= 2 && userLines.every(l => l.length < 40 || /^(al[oó]|bueno|s[ií]|hello|hola|d[ií]game)\b/i.test(l))) {
    return notInterested;
  }
  if (INTEREST_HINTS.test(text) && interested) return interested;
  return notInterested;
}

function normalizeCapturedValue(
  field: CampaignOutputField,
  raw: unknown
): { value: CellValue; pendingReview: boolean; rawText?: string } {
  if (raw == null || raw === "") return { value: null, pendingReview: false };

  if (field.field_type === "boolean") {
    if (typeof raw === "boolean") return { value: raw, pendingReview: false };
    const s = String(raw).trim().toLowerCase();
    if (["true", "sí", "si", "yes", "1"].includes(s)) return { value: true, pendingReview: false };
    if (["false", "no", "0"].includes(s)) return { value: false, pendingReview: false };
    return { value: null, pendingReview: true, rawText: String(raw) };
  }

  if (field.field_type === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return { value: n, pendingReview: false };
    return { value: null, pendingReview: true, rawText: String(raw) };
  }

  const s = String(raw).trim();
  if (!s) return { value: null, pendingReview: false };

  if (field.field_type === "select") {
    const match = field.options.find(o => o.trim().toLowerCase() === s.toLowerCase());
    if (match) return { value: match, pendingReview: false };
    // Respuesta fuera de las opciones → pendiente de revisión, no se guarda como válida.
    return { value: null, pendingReview: true, rawText: s };
  }

  return { value: s, pendingReview: false };
}

async function applyContactLinks(
  db: ReturnType<typeof adminClient>,
  userId: string,
  contactId: string,
  fields: CampaignOutputField[],
  captured: Record<string, CellValue>
): Promise<void> {
  const linked = fields.filter(f => f.contact_link?.contact_field && captured[f.key] != null);
  if (!linked.length) return;

  const { data: contact } = await db
    .from("crm_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!contact) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const prevMeta = (contact.metadata ?? {}) as Record<string, unknown>;
  const nextMeta = { ...prevMeta };
  let metaChanged = false;
  const prevProv = (contact.field_provenance ?? {}) as Record<string, unknown>;
  const nextProv = { ...prevProv };

  const provEntry = {
    origen: "ia_conversacion",
    confianza: "media",
    verificado: false,
    actualizado_por: "sistema_ia",
    actualizado_en: now,
  };

  for (const f of linked) {
    const link = f.contact_link!;
    const value = captured[f.key];
    const strValue = typeof value === "boolean" ? (value ? "Sí" : "No") : String(value);

    if (link.contact_field.startsWith("metadata.")) {
      const key = link.contact_field.slice("metadata.".length);
      const current = nextMeta[key];
      const empty = current == null || String(current).trim() === "";
      if (link.mode === "overwrite" || empty) {
        nextMeta[key] = strValue;
        nextProv[key] = provEntry;
        metaChanged = true;
      }
    } else {
      const current = (contact as Record<string, unknown>)[link.contact_field];
      const empty = current == null || String(current).trim() === "";
      if (link.mode === "overwrite" || empty) {
        patch[link.contact_field] = strValue;
        nextProv[link.contact_field] = provEntry;
      }
    }
  }

  if (metaChanged) patch.metadata = nextMeta;
  if (Object.keys(patch).length === 0) return;

  patch.field_provenance = nextProv;
  patch.updated_at = now;
  await db.from("crm_contacts").update(patch).eq("id", contactId).eq("user_id", userId);
}

async function createLeadOnInterest(
  db: ReturnType<typeof adminClient>,
  campaign: VoiceCampaignRecord,
  contactId: string,
  contactName: string
): Promise<string | null> {
  const { data: existingLead } = await db
    .from("crm_leads")
    .select("id")
    .eq("user_id", campaign.user_id)
    .eq("contact_id", contactId)
    .eq("outcome", "open")
    .limit(1)
    .maybeSingle();
  if (existingLead?.id) return String(existingLead.id);

  let stageId = campaign.crm_config.pipeline_stage_id;
  if (stageId) {
    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("id", stageId)
      .eq("user_id", campaign.user_id)
      .maybeSingle();
    if (!stage) stageId = null;
  }
  if (!stageId) {
    const { data: first } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("user_id", campaign.user_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    stageId = first?.id ? String(first.id) : null;
  }
  if (!stageId) return null;

  const now = new Date().toISOString();
  const { data: lead } = await db
    .from("crm_leads")
    .insert({
      user_id: campaign.user_id,
      contact_id: contactId,
      stage_id: stageId,
      title: `${campaign.name} — ${contactName}`,
      source: `Campaña: ${campaign.name}`,
      outcome: "open",
      stage_entered_at: now,
      sort_order: 0,
      metadata: { campaign_id: campaign.id },
    })
    .select("id")
    .single();

  return lead?.id ? String(lead.id) : null;
}

/**
 * "No contactar" global: marca la supresión en el contacto y cancela las llamadas
 * pendientes en TODAS las campañas activas del usuario.
 */
export async function applyDoNotCallEverywhere(input: {
  userId: string;
  contactId?: string | null;
  phoneE164?: string | null;
}): Promise<void> {
  const db = adminClient();
  const now = new Date().toISOString();
  let contactId = input.contactId ?? null;

  if (!contactId && input.phoneE164) {
    const { data } = await db
      .from("crm_contacts")
      .select("id")
      .eq("user_id", input.userId)
      .or(
        `whatsapp.eq."${input.phoneE164}",telefono.eq."${input.phoneE164}",phone.eq."${input.phoneE164}"`
      )
      .limit(1)
      .maybeSingle();
    contactId = data?.id ? String(data.id) : null;
  }

  if (contactId) {
    const { data: contact } = await db
      .from("crm_contacts")
      .select("supresiones")
      .eq("id", contactId)
      .eq("user_id", input.userId)
      .maybeSingle();
    const supresiones = parseSupresiones(contact?.supresiones);
    if (!supresiones.includes("no_llamadas")) {
      await db
        .from("crm_contacts")
        .update({ supresiones: [...supresiones, "no_llamadas"], updated_at: now })
        .eq("id", contactId)
        .eq("user_id", input.userId);
    }
  }

  // Cancela llamadas pendientes en todas las campañas (por contacto y por teléfono).
  const filters: string[] = [];
  if (contactId) filters.push(`crm_contact_id.eq.${contactId}`);
  if (input.phoneE164) filters.push(`phone_e164.eq."${input.phoneE164}"`);
  if (!filters.length) return;

  await db
    .from("campaign_audience_rows")
    .update({
      call_status: "skipped",
      excluded_reason: "no_contactar",
      scheduled_call_at: null,
      updated_at: now,
    })
    .in("call_status", ["pending", "retry"])
    .or(filters.join(","));
}

/**
 * Captura post-llamada: la IA llena los campos de salida de la campaña según
 * la instrucción de cada campo, guarda resultados en el prospecto, alimenta la
 * ficha del contacto (vínculos) y crea lead si la tipificación indica interés.
 */
export async function captureCampaignCallResults(input: {
  campaignId: string;
  audienceRowId: string;
  callId: string;
  transcript: TranscriptEntry[];
}): Promise<void> {
  if (!getOriApiKey()) return;
  const dialogue = transcriptToText(input.transcript);
  if (!dialogue.trim()) return;

  const db = adminClient();
  const { data: campaignRaw } = await db
    .from("voice_campaigns")
    .select("*")
    .eq("id", input.campaignId)
    .maybeSingle();
  if (!campaignRaw) return;

  const campaign = toVoiceCampaignRecord(campaignRaw as Record<string, unknown>);
  const fields = campaign.output_fields;

  const { data: row } = await db
    .from("campaign_audience_rows")
    .select("id, results, results_meta, crm_contact_id, crm_lead_id, contact_name, phone_e164")
    .eq("id", input.audienceRowId)
    .maybeSingle();
  if (!row) return;

  let captured: Record<string, unknown> = {};
  let optOut = false;

  try {
    const prompt = `Campos a capturar:\n${fieldSpecLines(fields)}\n\nTranscripción de la llamada:\n${dialogue}`;
    const { result: raw, usage, model } = await runInternalJsonPrompt<{ campos?: Record<string, unknown>; no_volver_a_llamar?: boolean }>(
      CAPTURE_SYSTEM,
      fields.length > 0
        ? prompt
        : `No hay campos personalizados. Solo evalúa "no_volver_a_llamar".\n\nTranscripción:\n${dialogue}`
    );
    captured = raw.campos ?? {};
    optOut = Boolean(raw.no_volver_a_llamar);

    const organizationId = (campaignRaw as Record<string, unknown>).organization_id;
    if (organizationId) {
      // Captura post-llamada automática — el crédito de la llamada ya se cobró; solo
      // se deja el costo real de este análisis visible en /admin/consumption.
      await recordUsageSafe({
        db,
        organizationId: String(organizationId),
        userId: (campaignRaw as Record<string, unknown>).user_id
          ? String((campaignRaw as Record<string, unknown>).user_id)
          : null,
        eventType: "ori",
        provider: "google",
        model,
        gemini: usage,
        creditsOverride: 0,
        channel: "campaign_capture",
        referenceType: "campaign_audience_row",
        referenceId: input.audienceRowId
      });
    }
  } catch (err) {
    console.error("[campaign-capture] extract:", err);
    return;
  }

  const primary = primaryOutputField(fields);
  if (primary && !(primary.key in captured)) {
    const inferred = inferPrimaryValue(primary, dialogue, captured, optOut);
    if (inferred) captured[primary.key] = inferred;
  }

  const prevResults = (row.results ?? {}) as Record<string, CellValue>;
  const prevMeta = (row.results_meta ?? {}) as Record<string, unknown>;
  const results: Record<string, CellValue> = { ...prevResults };
  const resultsMeta: Record<string, unknown> = { ...prevMeta };
  const validCaptured: Record<string, CellValue> = {};

  for (const field of fields) {
    if (!(field.key in captured)) continue;
    const { value, pendingReview, rawText } = normalizeCapturedValue(field, captured[field.key]);
    if (value != null) {
      results[field.key] = value;
      validCaptured[field.key] = value;
      delete resultsMeta[field.key];
    } else if (pendingReview && rawText) {
      resultsMeta[field.key] = { pending_review: true, raw: rawText };
    }
  }

  const primaryValue =
    primary && typeof results[primary.key] === "string" ? String(results[primary.key]) : null;

  const patch: Record<string, unknown> = {
    results,
    results_meta: resultsMeta,
    updated_at: new Date().toISOString(),
  };
  if (primaryValue) patch.result_primary = primaryValue;

  // Lead por interés (prospección en frío u override manual).
  let leadId: string | null = null;
  if (
    campaign.crm_config.create_leads === "on_interest" &&
    !row.crm_lead_id &&
    row.crm_contact_id &&
    primaryValue &&
    campaign.crm_config.interest_values.some(
      v => v.trim().toLowerCase() === primaryValue.trim().toLowerCase()
    )
  ) {
    leadId = await createLeadOnInterest(
      db,
      campaign,
      String(row.crm_contact_id),
      row.contact_name ?? row.phone_e164 ?? "Contacto"
    );
    if (leadId) patch.crm_lead_id = leadId;
  }

  await db.from("campaign_audience_rows").update(patch).eq("id", input.audienceRowId);

  // Registro por llamada: lo capturado en ESTE intento queda en la llamada (historial inmutable).
  const { data: call } = await db
    .from("voice_agent_calls")
    .select("extracted_data")
    .eq("id", input.callId)
    .maybeSingle();
  const prevExtracted = (call?.extracted_data ?? {}) as Record<string, unknown>;
  await db
    .from("voice_agent_calls")
    .update({
      extracted_data: {
        ...prevExtracted,
        campaign_capture: validCaptured,
        campaign_capture_pending: Object.fromEntries(
          Object.entries(resultsMeta).filter(([k]) => k in captured)
        ),
        ...(optOut ? { [OPT_OUT_KEY]: true } : {}),
      },
    })
    .eq("id", input.callId);

  // Vínculos campo → ficha del contacto.
  if (row.crm_contact_id && Object.keys(validCaptured).length > 0) {
    try {
      await applyContactLinks(db, campaign.user_id, String(row.crm_contact_id), fields, validCaptured);
    } catch (err) {
      console.error("[campaign-capture] contact links:", err);
    }
  }

  // Opt-out global.
  if (optOut) {
    try {
      await applyDoNotCallEverywhere({
        userId: campaign.user_id,
        contactId: row.crm_contact_id ? String(row.crm_contact_id) : null,
        phoneE164: row.phone_e164 ?? null,
      });
    } catch (err) {
      console.error("[campaign-capture] opt-out:", err);
    }
  }
}
