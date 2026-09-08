"use client";

import { useState } from "react";
import Link from "next/link";
import { Database, Plug, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { InsurerConnectorRow } from "@/components/automations/InsurerConnectorRow";
import { ExploreConnectorsModal } from "@/components/automations/ExploreConnectorsModal";
import { useConnectorsSummary } from "@/hooks/useConnectorsSummary";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnGhost } from "@/lib/brand-ui";
import type { DataTableRecord } from "@/types/data-table";

export interface AgentQuotingRulesValue {
  enabled: boolean;
  autoQuote: boolean;
}

/**
 * Conectores de un agente — sacado del onboarding (2026-09-06, pedido
 * explícito del usuario) y movido a la configuración del agente, donde de
 * verdad se administra. Muestra la tabla de datos como un conector más
 * ("Base de datos Noova") y, para la plantilla de seguros, las aseguradoras
 * conectadas + el interruptor de cotización — con una regla dura: no se
 * puede activar la cotización automática sin al menos un conector real
 * (tabla o aseguradora), porque sin eso el agente no tiene con qué vender.
 */
export function AgentConnectorsPanel({
  showDataTable,
  dataTableId,
  onChangeDataTableId,
  dataTables,
  isSegurosTemplate,
  quotingRules,
  onChangeQuotingRules
}: {
  showDataTable: boolean;
  dataTableId: string | null;
  onChangeDataTableId: (id: string | null) => void;
  dataTables: DataTableRecord[];
  isSegurosTemplate: boolean;
  quotingRules?: AgentQuotingRulesValue;
  onChangeQuotingRules?: (value: AgentQuotingRulesValue) => void;
}) {
  const { items: connectorItems } = useConnectorsSummary();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(false);

  const hasAseguradoraConnected = connectorItems.some(i => i.group === "Aseguradoras" && i.connected);
  const hasAnyConnector = Boolean(dataTableId) || hasAseguradoraConnected;
  const selectedTable = dataTables.find(t => t.id === dataTableId) ?? null;

  return (
    <div className="p-5 space-y-3 max-w-xl">
      <h2 className="text-sm font-semibold text-gray-300 mb-1">Conectores de este agente</h2>
      <p className="text-xs text-gray-500 mb-3">
        Lo que este agente puede usar para responder con datos reales, no solo con lo que dice el prompt.
      </p>

      {showDataTable && (
        <div className="rounded-xl border border-white/[.08] bg-white/[.03] p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0f7eff]/15 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-[#99c9ff]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Base de datos Noova</p>
              <p className="text-xs text-gray-500 truncate">
                {selectedTable ? `${selectedTable.name} · ${selectedTable.row_count} filas` : "Sin conectar"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingTable(v => !v)}
              className={`${btnGhost} !px-3 !py-1.5 !text-xs shrink-0`}
            >
              {selectedTable ? "Cambiar" : "Conectar"}
            </button>
          </div>
          {editingTable && (
            <div className="mt-3 pt-3 border-t border-white/[.06]">
              <NoovaSelect
                value={dataTableId ?? ""}
                onChange={v => {
                  onChangeDataTableId(v || null);
                  setEditingTable(false);
                }}
                allowEmpty={true}
                emptyLabel="Sin tabla (solo prompt)"
                options={dataTables.map(t => ({ value: t.id, label: `${t.name} · ${t.row_count} filas` }))}
              />
              <Link href="/dashboard/tablas" className="inline-block mt-2 text-[11px] text-[#0f7eff] hover:text-[#99c9ff]">
                Gestionar tablas de datos →
              </Link>
            </div>
          )}
        </div>
      )}

      {isSegurosTemplate && (
        <>
          <div className="rounded-xl border border-white/[.08] bg-white/[.03] overflow-hidden">
            <div className="px-3.5 pt-3.5 pb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Aseguradoras</p>
            </div>
            <InsurerConnectorRow providerKey="la_equidad" letters="LE" name="La Equidad Seguros" />
          </div>

          {quotingRules && onChangeQuotingRules && (
            <>
              <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-white/[.08] bg-white/[.03]">
                <span className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-[#99c9ff] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white">Activar cotizador</span>
                    <span className="block text-[11px] text-gray-500">Reúne datos y los deja listos para un asesor.</span>
                  </span>
                </span>
                <Switch
                  checked={quotingRules.enabled}
                  onChange={v => onChangeQuotingRules({ enabled: v, autoQuote: v ? quotingRules.autoQuote : false })}
                />
              </label>

              {quotingRules.enabled && (
                <label
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border ${
                    hasAnyConnector ? "border-amber-500/20 bg-amber-500/[.05]" : "border-white/[.08] bg-white/[.02] opacity-60"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">Cotizar automáticamente (avanzado)</span>
                      <span className="block text-[11px] text-gray-500">
                        {hasAnyConnector
                          ? "Da el precio real directo al cliente, sin pasar por un asesor."
                          : "Conecta al menos una aseguradora o tabla para poder activarlo."}
                      </span>
                    </span>
                  </span>
                  <Switch
                    checked={quotingRules.autoQuote}
                    disabled={!hasAnyConnector}
                    onChange={v => onChangeQuotingRules({ ...quotingRules, autoQuote: v })}
                  />
                </label>
              )}
            </>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setExploreOpen(true)}
        className={`${btnGhost} !text-xs gap-1.5 mt-1`}
      >
        <Plug className="w-3.5 h-3.5" /> Explorar conectores
      </button>

      <ExploreConnectorsModal
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        onConnected={() => setExploreOpen(false)}
        showAseguradoras={isSegurosTemplate}
      />
    </div>
  );
}
