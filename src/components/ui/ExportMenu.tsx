"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import { btnGhost } from "@/lib/brand-ui";
import {
  exportRowsToCsv,
  exportRowsToXlsx,
  stampedFilename,
  type ExportColumn,
} from "@/lib/export-table";

interface ExportMenuProps<T> {
  /** Nombre base del archivo (sin extensión ni fecha). */
  filename: string;
  columns: ExportColumn<T>[];
  /** Filas a exportar — normalmente las filtradas visibles. */
  rows: T[];
  /** Si hace falta enriquecer filas antes de exportar (p. ej. transcripción completa). */
  prepareRows?: () => Promise<T[]>;
  sheetName?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Botón "Exportar" con menú CSV / Excel — para cualquier tabla del sistema. */
export function ExportMenu<T>({
  filename,
  columns,
  rows,
  prepareRows,
  sheetName,
  label = "Exportar",
  disabled,
  className,
}: ExportMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doExport = async (format: "csv" | "xlsx") => {
    setOpen(false);
    if (!rows.length) return;
    setBusy(true);
    try {
      const exportRows = prepareRows ? await prepareRows() : rows;
      if (!exportRows.length) return;
      if (format === "csv") {
        exportRowsToCsv(stampedFilename(filename, "csv"), columns, exportRows);
      } else {
        await exportRowsToXlsx(stampedFilename(filename, "xlsx"), columns, exportRows, sheetName);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <NoovaAnchoredMenu
      open={open}
      onClose={() => setOpen(false)}
      menuClassName="min-w-[200px]"
      anchor={
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          disabled={disabled || busy || rows.length === 0}
          className={className ?? `${btnGhost} disabled:opacity-40`}
          title={rows.length === 0 ? "Sin filas para exportar" : `Exportar ${rows.length} filas`}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      }
    >
      <NoovaListMenuItem onClick={() => void doExport("xlsx")}>
        <span className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>
            Excel (.xlsx)
            <span className="block text-[11px] text-gray-500">{rows.length} filas</span>
          </span>
        </span>
      </NoovaListMenuItem>
      <NoovaListMenuItem onClick={() => void doExport("csv")}>
        <span className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-sky-400" />
          <span>
            CSV
            <span className="block text-[11px] text-gray-500">Compatible con cualquier hoja de cálculo</span>
          </span>
        </span>
      </NoovaListMenuItem>
    </NoovaAnchoredMenu>
  );
}
