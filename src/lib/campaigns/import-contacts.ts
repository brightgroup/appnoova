import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "@/lib/telephony/e164";
import { parseSupresiones } from "@/lib/crm-contactability";
import { resolveMappedCellValue } from "@/lib/campaigns/column-mapping";
import type {
  CampaignContactColumnMapping,
  CampaignFieldMapping,
  CampaignImportPolicy,
  CampaignImportSummary,
} from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";

type RowData = Record<string, string | number | boolean | null>;

interface ExistingContact {
  id: string;
  name: string | null;
  email: string | null;
  ciudad: string | null;
  organizacion: string | null;
  documento_id: string | null;
  notes: string | null;
  supresiones: unknown;
  metadata: Record<string, unknown> | null;
}

export interface AnalyzedRow {
  index: number;
  data: RowData;
  phoneRaw: string;
  phoneE164: string | null;
  contactName: string | null;
  existing: ExistingContact | null;
  duplicateOf: number | null;
  suppressed: boolean;
  reason: string | null;
}

function cellToString(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  return String(raw).trim();
}

/** Valor de una columna del Excel destinada a un campo del contacto. */
function contactFieldValue(data: RowData, columnKey: string, columns?: DataTableColumn[]): string | null {
  const raw = resolveMappedCellValue(data, columnKey, columns);
  const s = raw == null ? "" : String(raw).trim();
  return s || null;
}

/**
 * Analiza las filas del Excel contra el CRM: normaliza teléfonos, detecta duplicados
 * dentro del archivo, cruza contra crm_contacts por teléfono y marca supresiones.
 */
export async function analyzeAudienceAgainstCrm(
  db: SupabaseClient,
  userId: string,
  rows: RowData[],
  mapping: CampaignFieldMapping,
  columns?: DataTableColumn[]
): Promise<{ analyzed: AnalyzedRow[]; summary: CampaignImportSummary }> {
  const phoneByE164 = new Map<string, number>();
  const analyzed: AnalyzedRow[] = rows.map((data, index) => {
    const phoneRaw = cellToString(resolveMappedCellValue(data, mapping.phone_column, columns));
    const phoneE164 = phoneRaw ? toE164(phoneRaw) || null : null;
    const nameRaw = resolveMappedCellValue(data, mapping.name_column, columns);
    const contactName = nameRaw != null && String(nameRaw).trim() ? String(nameRaw).trim() : null;

    let duplicateOf: number | null = null;
    if (phoneE164) {
      if (phoneByE164.has(phoneE164)) duplicateOf = phoneByE164.get(phoneE164)!;
      else phoneByE164.set(phoneE164, index);
    }

    return {
      index,
      data,
      phoneRaw,
      phoneE164,
      contactName,
      existing: null,
      duplicateOf,
      suppressed: false,
      reason: phoneE164 ? null : phoneRaw ? "Teléfono inválido" : "Sin teléfono",
    };
  });

  // Cruce contra CRM por teléfono (whatsapp / telefono / phone) en lotes.
  const uniquePhones = [...phoneByE164.keys()];
  const byPhone = new Map<string, ExistingContact>();
  const chunk = 100;
  for (let i = 0; i < uniquePhones.length; i += chunk) {
    const slice = uniquePhones.slice(i, i + chunk);
    // Comillas para que PostgREST no interprete el "+" del E.164.
    const quoted = slice.map(p => `"${p}"`).join(",");
    const orFilter = [
      `whatsapp.in.(${quoted})`,
      `telefono.in.(${quoted})`,
      `phone.in.(${quoted})`,
    ].join(",");
    const { data: found } = await db
      .from("crm_contacts")
      .select("id, name, email, ciudad, organizacion, documento_id, notes, supresiones, metadata, whatsapp, telefono, phone")
      .eq("user_id", userId)
      .or(orFilter);

    for (const c of found ?? []) {
      const contact = c as ExistingContact & { whatsapp?: string; telefono?: string; phone?: string };
      for (const key of [contact.whatsapp, contact.telefono, contact.phone]) {
        if (key && slice.includes(key) && !byPhone.has(key)) byPhone.set(key, contact);
      }
    }
  }

  for (const row of analyzed) {
    if (!row.phoneE164 || row.duplicateOf != null) continue;
    const existing = byPhone.get(row.phoneE164) ?? null;
    row.existing = existing;
    if (existing && parseSupresiones(existing.supresiones).includes("no_llamadas")) {
      row.suppressed = true;
      row.reason = "Marcado como no contactar";
    }
  }

  const rejected = analyzed.filter(r => !r.phoneE164);
  const duplicates = analyzed.filter(r => r.duplicateOf != null);
  const valid = analyzed.filter(r => r.phoneE164 && r.duplicateOf == null);

  const summary: CampaignImportSummary = {
    total_rows: rows.length,
    duplicates_in_file: duplicates.length,
    invalid_phone: rejected.length,
    existing_contacts: valid.filter(r => r.existing && !r.suppressed).length,
    new_contacts: valid.filter(r => !r.existing && !r.suppressed).length,
    suppressed: valid.filter(r => r.suppressed).length,
    rejected_rows: rejected.map(r => ({
      row_index: r.index + 1,
      phone_raw: r.phoneRaw,
      reason: r.reason ?? "Teléfono inválido",
    })),
  };

  return { analyzed, summary };
}

const BUILTIN_CONTACT_FIELDS = new Set(["name", "email", "ciudad", "organizacion", "documento_id", "notes"]);

function buildContactPayload(
  row: AnalyzedRow,
  contactMappings: CampaignContactColumnMapping[],
  columns: DataTableColumn[] | undefined,
  sourceLabel: string
): { builtin: Record<string, string>; metadata: Record<string, string> } {
  const builtin: Record<string, string> = {};
  const metadata: Record<string, string> = {};

  if (row.contactName) builtin.name = row.contactName;

  for (const m of contactMappings) {
    const value = contactFieldValue(row.data, m.column_key, columns);
    if (!value) continue;
    if (m.contact_field.startsWith("metadata.")) {
      metadata[m.contact_field.slice("metadata.".length)] = value;
    } else if (BUILTIN_CONTACT_FIELDS.has(m.contact_field)) {
      builtin[m.contact_field] = value;
    }
  }

  void sourceLabel;
  return { builtin, metadata };
}

export interface CommitImportInput {
  db: SupabaseClient;
  userId: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  audienceTableId: string;
  analyzed: AnalyzedRow[];
  mapping: CampaignFieldMapping;
  columns?: DataTableColumn[];
  policy: CampaignImportPolicy;
  /** Crear lead + oportunidad al importar (campañas de seguimiento comercial). */
  createLeads?: { stageId: string | null };
  scheduledCallAtFor: (data: RowData) => string | null;
}

export interface CommitImportOutput {
  createdContacts: number;
  linkedContacts: number;
  enrolled: number;
  suppressed: number;
  leadsCreated: number;
  rowsPayload: {
    data: RowData;
    phone_e164: string | null;
    contact_name: string | null;
    crm_contact_id: string | null;
    crm_lead_id: string | null;
    call_status: string;
    excluded_reason: string | null;
    scheduled_call_at: string | null;
    sort_order: number;
  }[];
}

async function resolveLeadStage(
  db: SupabaseClient,
  userId: string,
  stageId: string | null
): Promise<string | null> {
  if (stageId) {
    const { data } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("id", stageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  const { data: first } = await db
    .from("crm_pipeline_stages")
    .select("id")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return first?.id ? String(first.id) : null;
}

/**
 * Ejecuta la importación confirmada: crea/vincula contactos según la política,
 * crea leads si aplica, e inscribe cada prospecto en la campaña.
 * Devuelve las filas listas para insertar en campaign_audience_rows.
 */
export async function commitAudienceImport(input: CommitImportInput): Promise<CommitImportOutput> {
  const { db, userId, campaignName, analyzed, mapping, columns, policy } = input;
  const now = new Date().toISOString();
  const sourceLabel = `Campaña: ${campaignName}`;
  const contactMappings = mapping.contact_fields ?? [];

  let createdContacts = 0;
  let linkedContacts = 0;
  let suppressed = 0;
  let leadsCreated = 0;

  const leadStageId = input.createLeads
    ? await resolveLeadStage(db, userId, input.createLeads.stageId)
    : null;

  const rowsPayload: CommitImportOutput["rowsPayload"] = [];
  let sortOrder = 0;

  for (const row of analyzed) {
    if (row.duplicateOf != null) continue;

    if (!row.phoneE164) {
      // Fila rechazada: se conserva inactiva para trazabilidad y descarga de errores.
      continue;
    }

    if (row.suppressed) {
      suppressed += 1;
      rowsPayload.push({
        data: row.data,
        phone_e164: row.phoneE164,
        contact_name: row.contactName,
        crm_contact_id: row.existing?.id ?? null,
        crm_lead_id: null,
        call_status: "skipped",
        excluded_reason: "no_contactar",
        scheduled_call_at: null,
        sort_order: sortOrder++,
      });
      continue;
    }

    const { builtin, metadata } = buildContactPayload(row, contactMappings, columns, sourceLabel);
    let contactId: string;

    if (row.existing) {
      contactId = row.existing.id;
      linkedContacts += 1;

      if (policy !== "skip") {
        const patch: Record<string, unknown> = { updated_at: now };
        const existing = row.existing;
        for (const [field, value] of Object.entries(builtin)) {
          const current = (existing as unknown as Record<string, unknown>)[field];
          const empty = current == null || String(current).trim() === "";
          if (policy === "overwrite" || empty) patch[field] = value;
        }
        if (Object.keys(metadata).length > 0) {
          const prevMeta = (existing.metadata ?? {}) as Record<string, unknown>;
          const nextMeta = { ...prevMeta };
          for (const [key, value] of Object.entries(metadata)) {
            const empty = prevMeta[key] == null || String(prevMeta[key]).trim() === "";
            if (policy === "overwrite" || empty) nextMeta[key] = value;
          }
          patch.metadata = nextMeta;
        }
        if (Object.keys(patch).length > 1) {
          await db.from("crm_contacts").update(patch).eq("id", contactId).eq("user_id", userId);
        }
      }
    } else {
      const { data: created, error } = await db
        .from("crm_contacts")
        .insert({
          user_id: userId,
          name: builtin.name ?? row.contactName ?? row.phoneE164,
          telefono: row.phoneE164,
          phone: row.phoneE164,
          email: builtin.email ?? null,
          ciudad: builtin.ciudad ?? null,
          organizacion: builtin.organizacion ?? null,
          company: builtin.organizacion ?? null,
          documento_id: builtin.documento_id ?? null,
          notes: builtin.notes ?? null,
          tipo_contacto: "persona",
          tipo_relacion: "prospecto",
          fuente_origen: sourceLabel,
          source: sourceLabel,
          tags: [],
          categorias_interes: [],
          supresiones: [],
          metadata: { ...metadata, registro_canal: "campana_llamadas" },
          field_provenance: {},
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (error || !created) {
        // Carrera: otro proceso lo creó — reintenta el match por teléfono.
        const { data: retry } = await db
          .from("crm_contacts")
          .select("id")
          .eq("user_id", userId)
          .or(
            `whatsapp.eq."${row.phoneE164}",telefono.eq."${row.phoneE164}",phone.eq."${row.phoneE164}"`
          )
          .limit(1)
          .maybeSingle();
        if (!retry?.id) continue;
        contactId = String(retry.id);
        linkedContacts += 1;
      } else {
        contactId = String(created.id);
        createdContacts += 1;
      }
    }

    let leadId: string | null = null;
    if (input.createLeads && leadStageId) {
      const { data: existingLead } = await db
        .from("crm_leads")
        .select("id")
        .eq("user_id", userId)
        .eq("contact_id", contactId)
        .eq("outcome", "open")
        .limit(1)
        .maybeSingle();

      if (existingLead?.id) {
        leadId = String(existingLead.id);
      } else {
        const { data: lead } = await db
          .from("crm_leads")
          .insert({
            user_id: userId,
            contact_id: contactId,
            stage_id: leadStageId,
            title: `${campaignName} — ${builtin.name ?? row.contactName ?? row.phoneE164}`,
            source: sourceLabel,
            outcome: "open",
            stage_entered_at: now,
            sort_order: 0,
            metadata: { campaign_id: input.campaignId },
          })
          .select("id")
          .single();
        if (lead?.id) {
          leadId = String(lead.id);
          leadsCreated += 1;
        }
      }
    }

    rowsPayload.push({
      data: row.data,
      phone_e164: row.phoneE164,
      contact_name: row.contactName,
      crm_contact_id: contactId,
      crm_lead_id: leadId,
      call_status: "pending",
      excluded_reason: null,
      scheduled_call_at: input.scheduledCallAtFor(row.data),
      sort_order: sortOrder++,
    });
  }

  return {
    createdContacts,
    linkedContacts,
    enrolled: rowsPayload.filter(r => r.call_status === "pending").length,
    suppressed,
    leadsCreated,
    rowsPayload,
  };
}
