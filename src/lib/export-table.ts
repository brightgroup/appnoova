/**
 * Exportación genérica de tablas a CSV y Excel (.xlsx).
 * Uso: definir columnas { header, value } y llamar exportRowsToCsv / exportRowsToXlsx.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function cellText(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

function csvCell(v: string | number | boolean | null | undefined): string {
  const s = cellText(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stampedFilename(base: string, ext: "csv" | "xlsx"): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.${ext}`;
}

export function exportRowsToCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const lines = [
    columns.map(c => csvCell(c.header)).join(","),
    ...rows.map(r => columns.map(c => csvCell(c.value(r))).join(",")),
  ];
  // BOM para que Excel abra el CSV con acentos correctos.
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename);
}

export async function exportRowsToXlsx<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
  sheetName = "Datos"
): Promise<void> {
  const XLSX = await import("xlsx");
  const headers = columns.map(c => c.header);
  const data = rows.map(r =>
    columns.map(c => {
      const v = c.value(r);
      if (v == null) return "";
      if (typeof v === "boolean") return v ? "Sí" : "No";
      return v;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  // Anchos de columna proporcionales al contenido para una lectura cómoda.
  ws["!cols"] = columns.map((c, i) => {
    const maxLen = Math.max(
      c.header.length,
      ...data.slice(0, 200).map(row => String(row[i] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 42) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
