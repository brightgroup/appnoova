"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import { N8nLogo } from "@/components/icons/brands/N8nLogo";
import { GoogleCalendarLogo } from "@/components/icons/brands/GoogleCalendarLogo";
import { ExploreConnectorsModal } from "@/components/automations/ExploreConnectorsModal";
import {
  btnPrimary,
  registryTable,
  registryTableHead,
  registryTableHeadRow,
  registryTableHeadCell,
  registryTableRowClickable,
  registryTableCell,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import type { AutomationConnectionRecord } from "@/lib/automations/connections-db";

interface CalendarConnectionStatus {
  configured: boolean;
  connection: {
    id: string;
    googleEmail: string | null;
    status: "active" | "disconnected" | "error";
    connectionMode: "oauth" | "hosted";
    sharedWithEmail: string | null;
  } | null;
}

interface ConnectorRow {
  id: string;
  kind: "webhook" | "google_calendar";
  name: string;
  detail: string;
  status: "active" | "disconnected" | "error" | "none";
  href: string;
}

export default function ConectoresPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<AutomationConnectionRecord[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<CalendarConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exploreOpen, setExploreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [connRes, calRes] = await Promise.all([
      authFetch("/api/automations/connections"),
      authFetch("/api/conectores/google-calendar/status")
    ]);
    const connJson = await connRes.json();
    if (!connRes.ok) setError(connJson.error ?? "Error al cargar conectores");
    else setConnections(connJson.connections ?? []);

    if (calRes.ok) setCalendarStatus(await calRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows: ConnectorRow[] = [
    ...connections.map((c): ConnectorRow => ({
      id: c.id,
      kind: "webhook",
      name: c.name,
      detail: new URL(c.webhookUrl).host,
      status: c.status,
      href: `/dashboard/conectores/${c.id}`
    })),
    ...(calendarStatus?.configured
      ? [
          {
            id: "google-calendar",
            kind: "google_calendar" as const,
            name: "Google Calendar",
            detail: calendarStatus.connection?.googleEmail
              ?? (calendarStatus.connection?.sharedWithEmail ? `Compartido con ${calendarStatus.connection.sharedWithEmail}` : "—"),
            status: (calendarStatus.connection?.status ?? "none") as ConnectorRow["status"],
            href: "/dashboard/conectores/google-calendar"
          }
        ]
      : [])
  ];

  return (
    <>
      <ChannelListPage
        title="Conectores"
        description="Las cuentas y sistemas que Noova tiene conectados. Úsalos como disparadores o acciones en tus workflows."
        loading={loading}
        onRefresh={load}
        refreshing={loading}
        error={error || undefined}
        action={
          <button type="button" onClick={() => setExploreOpen(true)} className={`${btnPrimary} gap-2`}>
            <Plus className="w-4 h-4" />
            Conectar
          </button>
        }
      >
        {rows.length === 0 ? (
          <div className={`${registryTableEmpty} flex flex-col items-center gap-3 py-16`}>
            <Plug className="w-10 h-10 text-gray-600" />
            <p className="text-gray-400">Aún no tienes conectores.</p>
            <button type="button" onClick={() => setExploreOpen(true)} className={`${btnPrimary} gap-2`}>
              <Plus className="w-4 h-4" /> Explorar conectores
            </button>
          </div>
        ) : (
          <table className={`${registryTable} min-w-[640px]`}>
            <thead className={registryTableHead}>
              <tr className={registryTableHeadRow}>
                <th className={registryTableHeadCell}>Conector</th>
                <th className={registryTableHeadCell}>Estado</th>
                <th className={registryTableHeadCell}>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={registryTableRowClickable} onClick={() => router.push(row.href)}>
                  <td className={registryTableCellFirst}>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          row.kind === "google_calendar" ? "bg-[#4285f4]/15" : "bg-[#ea4b71]/15"
                        }`}
                      >
                        {row.kind === "google_calendar" ? (
                          <GoogleCalendarLogo className="w-[18px] h-[18px] text-[#4285f4]" />
                        ) : (
                          <N8nLogo className="w-[18px] h-[18px] text-[#ea4b71]" />
                        )}
                      </div>
                      <div className="text-sm font-medium text-white truncate">{row.name}</div>
                    </div>
                  </td>
                  <td className={registryTableCell}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={`${registryTableCell} text-sm text-gray-400`}>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChannelListPage>

      <ExploreConnectorsModal
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        onConnected={connectionId => {
          setExploreOpen(false);
          router.push(`/dashboard/conectores/${connectionId}`);
        }}
      />
    </>
  );
}

function StatusBadge({ status }: { status: ConnectorRow["status"] }) {
  if (status === "active") return <Badge variant="emerald">Conectado</Badge>;
  if (status === "error") return <Badge variant="danger">Error</Badge>;
  if (status === "disconnected") return <Badge variant="neutral">Desconectado</Badge>;
  return <Badge variant="neutral">Sin conectar</Badge>;
}
