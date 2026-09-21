"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus, Plug, Database, Loader2, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { ConnectorLogo } from "@/components/automations/ConnectorIconTile";
import { ExploreConnectorsModal } from "@/components/automations/ExploreConnectorsModal";
import { AgentConnectorsManagerModal, type AgentQuotingRulesValue } from "@/components/agents/AgentConnectorsManagerModal";
import { useConnectorsSummary } from "@/hooks/useConnectorsSummary";
import { useAgentWhatsAppChannel } from "@/hooks/useAgentWhatsAppChannel";
import type { WooCommerceRules } from "@/lib/woocommerce/rules";
import type { DataTableRecord } from "@/types/data-table";

interface AgentConnectorsPopoverProps {
  /** Para saber qué número de WhatsApp atiende a este agente. */
  agentId?: string | null;
  showDataTable: boolean;
  dataTableId: string | null;
  onChangeDataTableId: (id: string | null) => void;
  dataTables: DataTableRecord[];
  isSegurosTemplate: boolean;
  quotingRules?: AgentQuotingRulesValue;
  onChangeQuotingRules?: (value: AgentQuotingRulesValue) => void;
  wooCommerceRules?: WooCommerceRules;
  onChangeWooCommerceRules?: (value: WooCommerceRules) => void;
}

/**
 * Conectores dentro del propio chat de prueba, como el "+" de ORI. Los logos
 * de lo que el agente tiene conectado se ven siempre en el composer, para no
 * tener que abrir nada y saber con qué está respondiendo.
 */
export function AgentConnectorsPopover(props: AgentConnectorsPopoverProps) {
  const { showDataTable, dataTableId, dataTables } = props;
  const { items, loading, refresh } = useConnectorsSummary();
  const { channel: whatsapp } = useAgentWhatsAppChannel(props.agentId ?? null);
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const connected = items.filter(i => i.connected);
  const selectedTable = dataTables.find(t => t.id === dataTableId) ?? null;
  // El cotizador no es un conector de la cuenta, pero sí algo que el agente usa
  // para responder: se muestra junto a los demás.
  const quotingOn = props.quotingRules?.enabled === true;
  const whatsappOn = whatsapp?.active === true;
  const activeCount =
    connected.length +
    (showDataTable && selectedTable ? 1 : 0) +
    (quotingOn ? 1 : 0) +
    (whatsappOn ? 1 : 0);

  return (
    <>
      <div className="flex items-center gap-1.5" ref={anchorRef}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          title="Conectores"
          aria-label="Conectores"
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            open
              ? "bg-[var(--nv-bg-control-hover)] text-[var(--nv-text)]"
              : "text-[var(--nv-text-faint)] hover:bg-[var(--nv-hover)] hover:text-[var(--nv-text)]"
          }`}
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* Lo conectado siempre a la vista, como en Gemini o Claude */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            title="Ver conectores activos"
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--nv-hover)]"
          >
            {showDataTable && selectedTable && (
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[var(--nv-bg-control)]">
                <Database className="h-3 w-3 text-[var(--nv-text-muted)]" />
              </span>
            )}
            {whatsappOn && (
              <ConnectorLogo id="whatsapp" className="h-[18px] w-[18px] rounded-[5px] object-contain" />
            )}
            {quotingOn && (
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[var(--nv-bg-control)]">
                <ShieldCheck className="h-3 w-3 text-[var(--nv-text-muted)]" />
              </span>
            )}
            {connected.slice(0, 4).map(item => (
              <ConnectorLogo
                key={item.id}
                id={item.id}
                className="h-[18px] w-[18px] rounded-[5px] object-contain"
              />
            ))}
            {connected.length > 4 && (
              <span className="text-[10px] text-[var(--nv-text-faint)]">+{connected.length - 4}</span>
            )}
          </button>
        )}
      </div>

      {open && (
        <ConnectorsPopoverPanel
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          loading={loading}
          connected={connected}
          quotingOn={quotingOn}
          whatsapp={whatsappOn ? whatsapp : null}
          showDataTable={showDataTable}
          selectedTable={selectedTable}
          onOpenManager={() => {
            setOpen(false);
            setManagerOpen(true);
          }}
          onOpenExplore={() => {
            setOpen(false);
            setExploreOpen(true);
          }}
        />
      )}

      <AgentConnectorsManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onOpenExplore={() => {
          setManagerOpen(false);
          setExploreOpen(true);
        }}
        connectors={items}
        connectorsLoading={loading}
        whatsapp={whatsappOn ? whatsapp : null}
        showDataTable={props.showDataTable}
        dataTableId={props.dataTableId}
        onChangeDataTableId={props.onChangeDataTableId}
        dataTables={props.dataTables}
        isSegurosTemplate={props.isSegurosTemplate}
        quotingRules={props.quotingRules}
        onChangeQuotingRules={props.onChangeQuotingRules}
        wooCommerceRules={props.wooCommerceRules}
        onChangeWooCommerceRules={props.onChangeWooCommerceRules}
      />

      <ExploreConnectorsModal
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        onConnected={() => {
          setExploreOpen(false);
          void refresh();
        }}
        showAseguradoras={props.isSegurosTemplate}
      />
    </>
  );
}

/**
 * En un portal a propósito: el chat recorta su contenido y crea su propio
 * contexto de apilado, así que un popover dentro del árbol quedaba por debajo
 * o cortado por el borde del composer.
 */
function ConnectorsPopoverPanel({
  anchorRef,
  onClose,
  loading,
  connected,
  quotingOn,
  whatsapp,
  showDataTable,
  selectedTable,
  onOpenManager,
  onOpenExplore
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  loading: boolean;
  connected: { id: string; name: string }[];
  quotingOn: boolean;
  whatsapp: { e164: string; friendlyName: string | null } | null;
  showDataTable: boolean;
  selectedTable: DataTableRecord | null;
  onOpenManager: () => void;
  onOpenExplore: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  const place = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 300;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    setPos({ left, bottom: window.innerHeight - rect.top + 8 });
  }, [anchorRef]);

  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // El menú de NoovaSelect vive en otro portal.
      if (target?.closest('[role="listbox"]')) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ left: pos.left, bottom: pos.bottom, width: 300 }}
      className="fixed z-[9998] overflow-hidden rounded-2xl border border-[var(--nv-border-strong)] bg-[var(--nv-bg-surface)] shadow-2xl"
    >
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-[var(--nv-text)]">Conectado a</p>
      </div>

      <div className="max-h-56 overflow-y-auto pb-1">
        {loading ? (
          <div className="flex items-center justify-center py-5">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--nv-text-faint)]" />
          </div>
        ) : showDataTable || connected.length > 0 || quotingOn || whatsapp ? (
          <>
            {whatsapp && (
              <ConnectorRow
                icon={<ConnectorLogo id="whatsapp" className="h-5 w-5 shrink-0 rounded-[6px] object-contain" />}
                name={whatsapp.friendlyName || "WhatsApp"}
                detail={whatsapp.e164}
                active
                onClick={onOpenManager}
              />
            )}
            {showDataTable && (
              <ConnectorRow
                icon={<Database className="h-5 w-5 shrink-0 text-[var(--nv-text-muted)]" />}
                name={selectedTable ? selectedTable.name : "Base de datos"}
                detail={selectedTable ? `${selectedTable.row_count} filas` : "Sin tabla"}
                active={Boolean(selectedTable)}
                onClick={onOpenManager}
              />
            )}
            {quotingOn && (
              <ConnectorRow
                icon={<ShieldCheck className="h-5 w-5 shrink-0 text-[var(--nv-text-muted)]" />}
                name="Cotizador"
                active
                onClick={onOpenManager}
              />
            )}
            {connected.map(item => (
              <ConnectorRow
                key={item.id}
                icon={<ConnectorLogo id={item.id} className="h-5 w-5 shrink-0 rounded-[6px] object-contain" />}
                name={item.name}
                active
                onClick={onOpenManager}
              />
            ))}
          </>
        ) : (
          <p className="px-4 pb-2 text-[11px] leading-relaxed text-[var(--nv-text-faint)]">
            Todavía no hay sistemas conectados a tu cuenta.
          </p>
        )}
      </div>

      <Link
        href="/dashboard/conectores"
        className="flex w-full items-center gap-2 border-t border-[var(--nv-border)] px-4 py-2.5 text-xs font-medium text-[var(--nv-text-muted)] transition-colors hover:bg-[var(--nv-hover)] hover:text-[var(--nv-text)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> Administrar conectores
      </Link>

      <button
        type="button"
        onClick={onOpenExplore}
        className="flex w-full items-center gap-2 border-t border-[var(--nv-border)] px-4 py-2.5 text-xs font-medium text-[#0f7eff] transition-colors hover:bg-[#0f7eff]/10"
      >
        <Plug className="h-3.5 w-3.5" /> Explorar / conectar más
      </button>
    </div>,
    document.body
  );
}

/** Fila del popover: informativa y uniforme. Al pulsarla se abre lo que este
 *  agente puede ajustar de ese conector (qué tabla consulta, qué permisos
 *  tiene), que es distinto de la conexión de la cuenta. */
function ConnectorRow({
  icon,
  name,
  detail,
  active,
  onClick
}: {
  icon: React.ReactNode;
  name: string;
  detail?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--nv-hover)]"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-[var(--nv-text-muted)]">{name}</span>
        {detail && (
          <span className="block truncate text-[10px] text-[var(--nv-text-faint)]">{detail}</span>
        )}
      </span>
      {active ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
      ) : (
        <span className="shrink-0 text-[10px] text-[var(--nv-text-faint)]">Sin conectar</span>
      )}
    </button>
  );
}
