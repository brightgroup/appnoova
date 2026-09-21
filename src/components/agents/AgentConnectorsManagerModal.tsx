"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, Database, ShieldCheck, Plug, Loader2 } from "lucide-react";
import { modalOverlay } from "@/lib/brand-ui";
import { ConnectorLogo } from "@/components/automations/ConnectorIconTile";
import { InsurerConnectorRow } from "@/components/automations/InsurerConnectorRow";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_WOOCOMMERCE_RULES, type WooCommerceRules } from "@/lib/woocommerce/rules";
import type { ConnectorSummaryItem } from "@/hooks/useConnectorsSummary";
import type { DataTableRecord } from "@/types/data-table";

const INSURER_CONNECTOR_IDS = ["la-equidad", "softseguros", "verifik", "placapi"];

/** Los dos interruptores del cotizador que se editan desde aquí; el resto de
 *  `QuotingRules` (ids de conexiones) lo conserva el formulario del agente. */
export interface AgentQuotingRulesValue {
  enabled: boolean;
  autoQuote: boolean;
}

/**
 * Lo que este agente tiene conectado, en tarjetas del mismo tamaño. Solo
 * aparece lo que de verdad está activo: para sumar algo nuevo está "Explorar
 * conectores", que es donde vive el catálogo completo.
 */
export function AgentConnectorsManagerModal({
  open,
  onClose,
  onOpenExplore,
  connectors,
  connectorsLoading,
  whatsapp,
  showDataTable,
  dataTableId,
  onChangeDataTableId,
  dataTables,
  isSegurosTemplate,
  quotingRules,
  onChangeQuotingRules,
  wooCommerceRules,
  onChangeWooCommerceRules
}: {
  open: boolean;
  onClose: () => void;
  onOpenExplore: () => void;
  connectors: ConnectorSummaryItem[];
  connectorsLoading: boolean;
  whatsapp: { id: string; e164: string; friendlyName: string | null } | null;
  showDataTable: boolean;
  dataTableId: string | null;
  onChangeDataTableId: (id: string | null) => void;
  dataTables: DataTableRecord[];
  isSegurosTemplate: boolean;
  quotingRules?: AgentQuotingRulesValue;
  onChangeQuotingRules?: (value: AgentQuotingRulesValue) => void;
  wooCommerceRules?: WooCommerceRules;
  onChangeWooCommerceRules?: (value: WooCommerceRules) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedTable = dataTables.find(t => t.id === dataTableId) ?? null;
  const wooConnected = connectors.some(i => i.id === "woocommerce" && i.connected);
  const hasInsurerConnected = connectors.some(i => INSURER_CONNECTOR_IDS.includes(i.id) && i.connected);
  const hasAnyConnector = Boolean(dataTableId) || hasInsurerConnected;

  // Siempre visible cuando el agente admite tabla: elegirla es parte de su
  // configuración, no un conector de la cuenta. Ocultarla cuando `dataTables`
  // viene vacío (carga lenta o fallo de red) dejaba sin editor a agentes que
  // sí tienen tabla guardada.
  const showTableCard = showDataTable;
  const simpleConnected = connectors.filter(i => i.connected && i.id !== "woocommerce");
  const isEmpty =
    !showTableCard && !wooConnected && simpleConnected.length === 0 && !isSegurosTemplate && !whatsapp;

  return (
    <div
      className={modalOverlay}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--nv-border)] px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--nv-text)]">Conectores del agente</h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--nv-text-faint)]">
              Lo que este agente puede usar para responder con datos reales.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[var(--nv-text-faint)] transition-colors hover:bg-[var(--nv-hover)] hover:text-[var(--nv-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
          {connectorsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--nv-text-faint)]" />
            </div>
          ) : (
            <>
              {showTableCard && (
                <ConnectorCard
                  icon={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-bg-surface)]"><Database className="h-4 w-4 text-[var(--nv-text-muted)]" /></span>}
                  title="Base de datos Noova"
                  subtitle={
                    selectedTable
                      ? `${selectedTable.name} · ${selectedTable.row_count} filas`
                      : "Elige con qué tabla responde este agente"
                  }
                  active={Boolean(selectedTable)}
                >
                  {dataTables.length > 0 ? (
                    <NoovaSelect
                      value={dataTableId ?? ""}
                      onChange={v => onChangeDataTableId(v || null)}
                      allowEmpty={true}
                      emptyLabel="Sin tabla (solo prompt)"
                      options={dataTables.map(t => ({
                        value: t.id,
                        label: `${t.name} · ${t.row_count} filas`
                      }))}
                    />
                  ) : (
                    <p className="text-[11.5px] leading-relaxed text-[var(--nv-text-faint)]">
                      No se pudo cargar la lista de tablas. Recarga la página, o{" "}
                      <Link href="/dashboard/tablas" className="text-[#0f7eff] hover:underline">
                        crea una tabla
                      </Link>{" "}
                      si todavía no tienes ninguna.
                    </p>
                  )}
                  <Link
                    href="/dashboard/tablas"
                    className="mt-2 inline-block text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
                  >
                    Gestionar tablas de datos →
                  </Link>
                </ConnectorCard>
              )}

              {whatsapp && (
                <ConnectorCard
                  icon={<ConnectorLogo id="whatsapp" className="h-8 w-8 rounded-lg object-contain" />}
                  title={whatsapp.friendlyName || "WhatsApp"}
                  subtitle={`${whatsapp.e164} · atiende este agente`}
                  active
                >
                  <Link
                    href={`/dashboard/canales/whatsapp/${whatsapp.id}`}
                    className="text-[11px] text-[#0f7eff] hover:text-[#99c9ff]"
                  >
                    Administrar la línea →
                  </Link>
                </ConnectorCard>
              )}

              {wooConnected && wooCommerceRules && onChangeWooCommerceRules && (
                <ConnectorCard
                  icon={<ConnectorLogo id="woocommerce" className="h-8 w-8 rounded-lg object-contain" />}
                  title="WooCommerce"
                  subtitle="Qué puede hacer este agente en tu tienda"
                  active={wooCommerceRules.enabled}
                  action={
                    <Switch
                      checked={wooCommerceRules.enabled}
                      onChange={v =>
                        onChangeWooCommerceRules(
                          v ? { ...wooCommerceRules, enabled: true } : DEFAULT_WOOCOMMERCE_RULES
                        )
                      }
                    />
                  }
                >
                  {wooCommerceRules.enabled && (
                    <div className="space-y-2">
                      {(
                        [
                          ["canReadProducts", "Consultar productos"],
                          ["canReadOrders", "Consultar pedidos"],
                          ["canWriteProducts", "Actualizar productos (stock/precio)"],
                          ["canWriteOrders", "Actualizar pedidos (estado/nota)"]
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-3">
                          <span className="text-xs text-[var(--nv-text-muted)]">{label}</span>
                          <Switch
                            checked={wooCommerceRules[key]}
                            onChange={v => onChangeWooCommerceRules({ ...wooCommerceRules, [key]: v })}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </ConnectorCard>
              )}

              {isSegurosTemplate && (
                <>
                  {hasInsurerConnected && (
                    <ConnectorCard
                      icon={<ConnectorLogo id="la-equidad" className="h-8 w-8 rounded-lg object-contain" />}
                      title="Aseguradoras"
                      subtitle="Cotiza con tarifas reales"
                      active
                    >
                      <InsurerConnectorRow providerKey="la_equidad" letters="LE" name="La Equidad Seguros" />
                    </ConnectorCard>
                  )}

                  {quotingRules && onChangeQuotingRules && (
                    <ConnectorCard
                      icon={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--nv-bg-surface)]"><ShieldCheck className="h-4 w-4 text-[var(--nv-text-muted)]" /></span>}
                      title="Cotizador"
                      subtitle="Reúne los datos y los deja listos para un asesor"
                      active={quotingRules.enabled}
                      action={
                        <Switch
                          checked={quotingRules.enabled}
                          onChange={v =>
                            onChangeQuotingRules({
                              enabled: v,
                              autoQuote: v ? quotingRules.autoQuote : false
                            })
                          }
                        />
                      }
                    >
                      {quotingRules.enabled && (
                        <label className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-xs text-[var(--nv-text-muted)]">
                              Cotizar automáticamente (avanzado)
                            </span>
                            <span className="block text-[10.5px] text-[var(--nv-text-faint)]">
                              {hasAnyConnector
                                ? "Da el precio real directo al cliente, sin pasar por un asesor."
                                : "Conecta al menos una aseguradora o tabla para poder activarlo."}
                            </span>
                          </span>
                          <Switch
                            checked={quotingRules.autoQuote}
                            disabled={!hasAnyConnector}
                            onChange={v => onChangeQuotingRules({ ...quotingRules, autoQuote: v })}
                          />
                        </label>
                      )}
                    </ConnectorCard>
                  )}
                </>
              )}

              {simpleConnected.filter(i => !INSURER_CONNECTOR_IDS.includes(i.id)).length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {simpleConnected
                    .filter(i => !INSURER_CONNECTOR_IDS.includes(i.id))
                    .map(item => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] px-3.5 py-3"
                      >
                        <ConnectorLogo id={item.id} className="h-7 w-7 shrink-0 rounded-lg object-contain" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--nv-text)]">
                          {item.name}
                        </span>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      </div>
                    ))}
                </div>
              )}

              {isEmpty && (
                <div className="py-10 text-center">
                  <p className="text-sm text-[var(--nv-text-muted)]">Este agente aún no usa ningún conector.</p>
                  <p className="mt-1 text-[11.5px] text-[var(--nv-text-faint)]">
                    Responde solo con lo que dice su prompt.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-[var(--nv-border)] px-6 py-3.5">
          <button
            type="button"
            onClick={onOpenExplore}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#0f7eff] transition-colors hover:bg-[#0f7eff]/10"
          >
            <Plug className="h-3.5 w-3.5" /> Explorar conectores
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({
  icon,
  title,
  subtitle,
  active,
  action,
  children
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg-control)] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[var(--nv-text)]">{title}</p>
          <p className="truncate text-[11px] text-[var(--nv-text-faint)]">{subtitle}</p>
        </div>
        {action ?? (active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />)}
      </div>
      {children && <div className="mt-3.5">{children}</div>}
    </div>
  );
}
