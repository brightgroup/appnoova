import type { CampaignFieldMapping, CampaignVariable } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import { resolveMappedCellValue } from "@/lib/campaigns/column-mapping";

/** Normaliza una etiqueta a un token seguro para usar como {{variable}}. */
export function slugifyVariableKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

/**
 * Lista de variables disponibles en una campaña.
 * Built-ins: nombre + telefono (derivadas del mapeo principal).
 * Custom: cada campo mapeado, con su variable_key editable.
 */
export function campaignVariables(mapping: CampaignFieldMapping): CampaignVariable[] {
  const vars: CampaignVariable[] = [];
  const seen = new Set<string>();

  const push = (v: CampaignVariable) => {
    if (!v.key || seen.has(v.key)) return;
    seen.add(v.key);
    vars.push(v);
  };

  if (mapping.name_column) {
    push({ key: "nombre", label: "Nombre", column_key: mapping.name_column, builtin: true });
  }
  if (mapping.phone_column) {
    push({ key: "telefono", label: "Teléfono", column_key: mapping.phone_column, builtin: true });
  }

  for (const cf of mapping.custom_fields ?? []) {
    if (!cf.column_key) continue;
    const key = (cf.variable_key || slugifyVariableKey(cf.label || cf.column_key)).trim();
    if (!key) continue;
    push({ key, label: cf.label || key, column_key: cf.column_key });
  }

  return vars;
}

/** Construye el mapa variable_key → valor a partir de una fila de audiencia. */
export function buildRowVariables(
  row: Record<string, string | number | boolean | null>,
  mapping: CampaignFieldMapping,
  columns?: DataTableColumn[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of campaignVariables(mapping)) {
    const raw = v.column_key ? resolveMappedCellValue(row, v.column_key, columns) : null;
    out[v.key] = raw == null ? "" : String(raw).trim();
  }
  // Conveniencia: primer nombre a partir de "nombre".
  if (out.nombre && out.primer_nombre === undefined) {
    out.primer_nombre = out.nombre.split(/\s+/)[0] ?? "";
  }
  return out;
}

/** Reemplaza los tokens {{key}} por su valor. Si falta, deja el token intacto. */
export function renderCampaignPrompt(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== "" ? val : match;
  });
}

/** Devuelve los tokens {{...}} presentes en un template. */
export function extractTemplateTokens(template: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) set.add(m[1]);
  return [...set];
}

/**
 * Prompt final para una llamada de campaña: usa el prompt de la campaña
 * (o el del agente como fallback) y sustituye las variables de la fila.
 * Lo consumirá el marcador automático (fase siguiente).
 */
export function buildCampaignCallPrompt(params: {
  promptTemplate: string | null;
  agentPrompt: string;
  row: Record<string, string | number | boolean | null>;
  mapping: CampaignFieldMapping;
  columns?: DataTableColumn[];
}): string {
  const template = (params.promptTemplate ?? "").trim() || params.agentPrompt;
  const variables = buildRowVariables(params.row, params.mapping, params.columns);
  return renderCampaignPrompt(template, variables);
}
