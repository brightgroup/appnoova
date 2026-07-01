import type { CampaignAutoMapResult, CampaignCustomFieldMapping } from "@/types/voice-campaign";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const PHONE_PATTERNS = [
  /\btelefono\b/,
  /\bcelular\b/,
  /\bmovil\b/,
  /\bphone\b/,
  /\bwhatsapp\b/,
  /\bnumero\b/,
  /\be164\b/,
  /\bcontacto\b.*\bnum/,
];

const NAME_PATTERNS = [
  /^nombre$/,
  /\bnombre\b/,
  /\bname\b/,
  /\bcontacto\b/,
  /\bcliente\b/,
  /\btitular\b/,
];

const DATE_PATTERNS = [
  /\bfecha\b/,
  /\bdate\b/,
  /\brenovacion\b/,
  /\bvencimiento\b/,
  /\bexpir/,
  /\bllamada\b/,
];

function scoreColumn(label: string, patterns: RegExp[]): number {
  const n = normalize(label);
  let score = 0;
  for (const p of patterns) {
    if (p.test(n)) score += 10;
  }
  if (n.includes("telefono") || n === "phone") score += 15;
  if (n === "nombre" || n === "name") score += 15;
  return score;
}

function bestMatch(labels: string[], patterns: RegExp[]): string | null {
  let best: { label: string; score: number } | null = null;
  for (const label of labels) {
    const score = scoreColumn(label, patterns);
    if (score > 0 && (!best || score > best.score)) {
      best = { label, score };
    }
  }
  return best?.label ?? null;
}

/** Mapeo heurístico de columnas Excel → campos de campaña. */
export function autoMapCampaignColumns(
  columnLabels: string[],
  triggerNeedsDate: boolean
): CampaignAutoMapResult {
  const phone = bestMatch(columnLabels, PHONE_PATTERNS);
  const name = bestMatch(columnLabels, NAME_PATTERNS);
  const date = triggerNeedsDate ? bestMatch(columnLabels, DATE_PATTERNS) : null;

  const used = new Set([phone, name, date].filter(Boolean) as string[]);
  const custom_fields: CampaignCustomFieldMapping[] = columnLabels
    .filter(label => !used.has(label))
    .slice(0, 8)
    .map(label => ({ label, column_key: label }));

  const confidence =
    phone && name ? (date || !triggerNeedsDate ? "high" : "medium") : phone || name ? "medium" : "low";

  return {
    phone_column: phone,
    name_column: name,
    call_date_column: date,
    custom_fields,
    confidence,
  };
}
