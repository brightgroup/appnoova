import type { DataTableColumn } from "@/types/data-table";
import type { CampaignFieldMapping } from "@/types/voice-campaign";
import { autoMapCampaignColumns } from "@/lib/campaigns/auto-map-fields";

/** Resuelve valor de celda usando clave interna o etiqueta legacy. */
export function resolveMappedCellValue(
  row: Record<string, string | number | boolean | null>,
  columnRef: string | null | undefined,
  columns?: DataTableColumn[]
): string | number | boolean | null {
  if (!columnRef) return null;
  if (Object.prototype.hasOwnProperty.call(row, columnRef)) {
    const v = row[columnRef];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  const col = columns?.find(c => c.key === columnRef || c.label === columnRef);
  if (col && Object.prototype.hasOwnProperty.call(row, col.key)) {
    return row[col.key];
  }
  return null;
}

export function autoMapCampaignColumnsFromSchema(
  columns: DataTableColumn[],
  triggerNeedsDate: boolean
): CampaignFieldMapping {
  const labels = columns.map(c => c.label);
  const base = autoMapCampaignColumns(labels, triggerNeedsDate);

  const toKey = (labelOrKey: string | null | undefined): string => {
    if (!labelOrKey) return "";
    const hit = columns.find(c => c.key === labelOrKey || c.label === labelOrKey);
    return hit?.key ?? labelOrKey;
  };

  const used = new Set<string>();
  const phone = toKey(base.phone_column);
  const name = toKey(base.name_column);
  const date = base.call_date_column ? toKey(base.call_date_column) : null;
  if (phone) used.add(phone);
  if (name) used.add(name);
  if (date) used.add(date);

  return {
    phone_column: phone,
    name_column: name,
    call_date_column: date,
    custom_fields: [],
  };
}
