import { validateLeadPayload } from "@/lib/crm-lead-utils";
import type { CrmLeadOutcome, CrmMotivoPerdida } from "@/types/crm";

const MOTIVOS: CrmMotivoPerdida[] = [
  "precio",
  "no_respondio",
  "compro_otro",
  "no_era_momento",
  "sin_presupuesto",
  "datos_incompletos",
  "otro"
];

function parseEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const v = String(raw ?? "");
  return allowed.includes(v as T) ? (v as T) : null;
}

export function buildLeadRowFromBody(
  body: Record<string, unknown>,
  opts: { isCreate?: boolean; previousStageId?: string }
): { row: Record<string, unknown>; error: string | null } {
  const row: Record<string, unknown> = {};

  if (body.stage_id !== undefined) row.stage_id = String(body.stage_id);
  if (body.title !== undefined) row.title = String(body.title).trim();
  if (body.contact_id !== undefined) {
    row.contact_id = String(body.contact_id);
  }
  if (body.value_amount !== undefined) {
    row.value_amount = body.value_amount != null ? Number(body.value_amount) : null;
  }
  if (body.source !== undefined) row.source = body.source ? String(body.source).trim() : null;
  if (body.notes !== undefined) row.notes = body.notes ? String(body.notes).trim() : null;
  if (body.sort_order !== undefined) row.sort_order = Number(body.sort_order);
  if (body.currency !== undefined) row.currency = String(body.currency ?? "COP");
  if (body.outcome !== undefined) {
    const o = String(body.outcome);
    if (o === "won" || o === "lost" || o === "open") row.outcome = o;
  }
  if (body.motivo_perdida !== undefined) {
    row.motivo_perdida = body.motivo_perdida ? parseEnum(body.motivo_perdida, MOTIVOS) : null;
  }
  if (body.motivo_perdida_detalle !== undefined) {
    row.motivo_perdida_detalle = body.motivo_perdida_detalle
      ? String(body.motivo_perdida_detalle).trim()
      : null;
  }
  if (body.asesor_responsable !== undefined) {
    row.asesor_responsable = body.asesor_responsable
      ? String(body.asesor_responsable).trim()
      : null;
  }
  if (body.categoria_interes !== undefined) {
    row.categoria_interes = body.categoria_interes ? String(body.categoria_interes).trim() : null;
  }
  if (body.producto_interes !== undefined) {
    row.producto_interes = body.producto_interes ? String(body.producto_interes).trim() : null;
  }
  if (body.score !== undefined) {
    row.score = body.score != null ? Number(body.score) : null;
  }
  if (body.temperatura !== undefined) {
    row.temperatura = body.temperatura ? String(body.temperatura) : null;
  }
  if (body.inbox_conversation_id !== undefined) {
    row.inbox_conversation_id = body.inbox_conversation_id
      ? String(body.inbox_conversation_id)
      : null;
  }
  if (body.fecha_ultima_interaccion !== undefined) {
    row.fecha_ultima_interaccion = body.fecha_ultima_interaccion
      ? String(body.fecha_ultima_interaccion)
      : null;
  }

  if (
    body.stage_id !== undefined &&
    opts.previousStageId &&
    String(body.stage_id) !== opts.previousStageId
  ) {
    row.stage_entered_at = new Date().toISOString();
  }

  const outcome = (row.outcome ?? body.outcome ?? "open") as CrmLeadOutcome;
  const validationError = validateLeadPayload({
    outcome,
    contact_id:
      row.contact_id !== undefined
        ? (row.contact_id as string | null)
        : body.contact_id
          ? String(body.contact_id)
          : null,
    motivo_perdida:
      row.motivo_perdida !== undefined
        ? (row.motivo_perdida as CrmMotivoPerdida | null)
        : body.motivo_perdida
          ? parseEnum(body.motivo_perdida, MOTIVOS)
          : null,
    isCreate: opts.isCreate
  });

  if (validationError) {
    return { row, error: validationError };
  }

  return { row, error: null };
}

export function validateLeadPatch(merged: {
  outcome: CrmLeadOutcome;
  contact_id: string | null;
  motivo_perdida: CrmMotivoPerdida | null;
}): string | null {
  return validateLeadPayload(merged);
}
