import type { CampaignFieldMapping, CampaignTriggerRule } from "@/types/voice-campaign";
import type { DataTableColumn } from "@/types/data-table";
import { resolveMappedCellValue } from "@/lib/campaigns/column-mapping";
import { toE164 } from "@/lib/telephony/e164";

function parseDateValue(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && raw > 30000 && raw < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + raw);
    return excelEpoch;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function applyOffset(date: Date, offsetDays: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function defaultCallTime(): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
}

export function computeScheduledCallAt(
  row: Record<string, string | number | boolean | null>,
  mapping: CampaignFieldMapping,
  trigger: CampaignTriggerRule
): Date | null {
  if (trigger.type === "on_activate") {
    return defaultCallTime();
  }

  if (trigger.type === "fixed_datetime" && trigger.fixed_at) {
    const fixed = new Date(trigger.fixed_at);
    return Number.isNaN(fixed.getTime()) ? defaultCallTime() : fixed;
  }

  if (trigger.type === "excel_date") {
    const col = mapping.call_date_column || trigger.column_key;
    if (!col) return defaultCallTime();
    const parsed = parseDateValue(resolveMappedCellValue(row, col, undefined));
    if (!parsed) return null;
    const offset = trigger.offset_days ?? 0;
    const scheduled = applyOffset(parsed, offset);
    scheduled.setHours(9, 0, 0, 0);
    return scheduled;
  }

  return defaultCallTime();
}

function cellToPhoneString(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(Math.trunc(raw));
  }
  return String(raw).trim();
}

export function extractRowContactFields(
  row: Record<string, string | number | boolean | null>,
  mapping: CampaignFieldMapping,
  columns?: DataTableColumn[]
): { phone_e164: string | null; contact_name: string | null } {
  const phoneRaw = resolveMappedCellValue(row, mapping.phone_column, columns);
  const nameRaw = resolveMappedCellValue(row, mapping.name_column, columns);
  const phoneStr = cellToPhoneString(phoneRaw);
  const phone = phoneStr ? toE164(phoneStr) : "";
  const contact_name = nameRaw != null ? String(nameRaw).trim() : "";
  return {
    phone_e164: phone || null,
    contact_name: contact_name || null,
  };
}
