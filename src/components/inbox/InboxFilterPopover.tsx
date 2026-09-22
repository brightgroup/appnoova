"use client";

import { useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { registryListShell } from "@/lib/brand-ui";
import { inboxChannelStyle } from "@/lib/inbox-channel-ui";
import { DATE_RANGE_ALL, isDateRangeActive, type DateRangeValue } from "@/lib/date-range-filter";

/**
 * Filtro del Inbox (canal + fecha del último mensaje), con el mismo patrón visual
 * que el popover "Filtro" de Leads: botón con punto azul cuando hay algo activo,
 * panel con secciones y "Limpiar".
 */
export function InboxFilterPopover({
  channel,
  onChannelChange,
  dateRange,
  onDateRangeChange,
  availableChannels
}: {
  channel: string;
  onChannelChange: (value: string) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (value: DateRangeValue) => void;
  /** Canales presentes en la bandeja — no se ofrecen opciones que no existen. */
  availableChannels: string[];
}) {
  const [open, setOpen] = useState(false);
  const isDefault = channel === "" && !isDateRangeActive(dateRange);

  const channelOptions = useMemo(
    () => [
      { value: "", label: "Todos los canales" },
      ...availableChannels.map(c => ({ value: c, label: inboxChannelStyle(c).label }))
    ],
    [availableChannels]
  );

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative rounded-xl border border-white/[.08] bg-white/[.08] p-2.5 text-white/50 transition-colors hover:text-white"
        aria-label="Filtros"
        aria-expanded={open}
      >
        <Filter className="h-4 w-4" />
        {!isDefault && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#0f7eff]" />}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Cerrar filtro" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 z-50 mt-2 w-72 ${registryListShell} space-y-4 p-4`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Filtro</p>
              <button
                type="button"
                onClick={() => {
                  onChannelChange("");
                  onDateRangeChange(DATE_RANGE_ALL);
                }}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" /> Limpiar
              </button>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-gray-400">Canal</p>
              <NoovaSelect
                value={channel}
                onChange={onChannelChange}
                options={channelOptions}
                allowEmpty={false}
                searchable={false}
              />
            </div>
            <DateRangeFilter value={dateRange} onChange={onDateRangeChange} label="Último mensaje" />
          </div>
        </>
      )}
    </div>
  );
}
