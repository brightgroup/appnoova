import { FUENTE_ORIGEN_OPTIONS, TIPO_RELACION_LABELS, VENTANA_WA_LABELS } from "@/lib/crm-contactability";
import type { CrmContact } from "@/types/crm";

const FUENTE_LABELS = Object.fromEntries(FUENTE_ORIGEN_OPTIONS.map(o => [o.value, o.label]));

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function contactToRow(c: CrmContact): string[] {
  return [
    c.name,
    c.tipo_contacto,
    c.documento_id ?? "",
    c.organizacion ?? "",
    c.whatsapp ?? "",
    c.telefono ?? "",
    c.email ?? "",
    c.ciudad ?? "",
    FUENTE_LABELS[c.fuente_origen ?? ""] ?? c.fuente_origen ?? "",
    TIPO_RELACION_LABELS[c.tipo_relacion] ?? c.tipo_relacion,
    VENTANA_WA_LABELS[c.ventana_wa_estado],
    (c.categorias_interes ?? []).join("; "),
    (c.tags ?? []).join("; "),
    (c.supresiones ?? []).join("; "),
    c.autorizacion_datos ? "Sí" : "No",
    c.notes ?? "",
    c.created_at,
    c.updated_at
  ];
}

const CSV_HEADERS = [
  "Nombre",
  "Tipo",
  "Documento",
  "Organización",
  "WhatsApp",
  "Teléfono",
  "Email",
  "Ciudad",
  "Fuente",
  "Relación",
  "Ventana WA",
  "Categorías",
  "Etiquetas",
  "Supresiones",
  "Autorización datos",
  "Notas",
  "Creado",
  "Actualizado"
];

export function contactsToCsv(contacts: CrmContact[]): string {
  const lines = [
    CSV_HEADERS.map(csvCell).join(","),
    ...contacts.map(c => contactToRow(c).map(csvCell).join(","))
  ];
  return lines.join("\n");
}

export function downloadContactsCsv(contacts: CrmContact[], filename = "contactos.csv") {
  const csv = contactsToCsv(contacts);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
