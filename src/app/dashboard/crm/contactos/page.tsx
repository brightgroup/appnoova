"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, Plus, Settings, User } from "lucide-react";
import { getAuthHeaders } from "@/lib/text-agents-api";
import {
  btnGhost,
  btnPrimary,
  btnFilterGroup,
  btnFilterActive,
  btnFilterIdle,
  registryTable,
  registryTableCell,
  registryTableHead,
  registryTableHeadCell,
  registryTableHeadRow,
  registryTableRowClickable,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import type { CrmContact, CrmContactFilter } from "@/types/crm";

export default function CrmContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CrmContactFilter>("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const url = search.trim()
      ? `/api/crm/contacts?q=${encodeURIComponent(search.trim())}`
      : "/api/crm/contacts";
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (res.ok) setContacts(data.contacts ?? []);
    if (!silent) setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (filter === "with_phone") list = list.filter(c => c.phone);
    else if (filter === "with_email") list = list.filter(c => c.email);
    else if (filter === "recent") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(c => new Date(c.updated_at).getTime() >= weekAgo);
    }
    return list;
  }, [contacts, filter]);

  return (
    <ChannelListPage
      title="Contactos"
      description="Personas y empresas — base para leads, inbox y automatizaciones."
      loading={loading}
      tableDescription="Haz clic en un contacto para editarlo."
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar"
      onRefresh={() => load()}
      refreshing={loading}
      filters={
        <div className={btnFilterGroup}>
          {([
            ["all", "Todos"],
            ["with_phone", "Con teléfono"],
            ["with_email", "Con email"],
            ["recent", "Recientes"]
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={filter === id ? btnFilterActive : btnFilterIdle}
            >
              {label}
            </button>
          ))}
        </div>
      }
      action={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/crm/configuracion" className={btnGhost}>
            <Settings className="w-4 h-4" />
          </Link>
          <Link href="/dashboard/crm/contactos/nuevo" className={btnPrimary}>
            <Plus className="w-4 h-4" /> Nuevo contacto
          </Link>
        </div>
      }
      footer={
        filtered.length > 0 ? (
          <span>
            Mostrando <span className="text-gray-200">{filtered.length}</span> de {contacts.length} contactos
          </span>
        ) : undefined
      }
    >
      {filtered.length === 0 ? (
        <div className={registryTableEmpty}>
          {search.trim() || filter !== "all"
            ? "No hay contactos con estos filtros."
            : "Aún no tienes contactos. Crea uno con «Nuevo contacto»."}
        </div>
      ) : (
        <table className={`${registryTable} min-w-[860px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={registryTableHeadCell}>Contacto</th>
              <th className={registryTableHeadCell}>Empresa / Cargo</th>
              <th className={registryTableHeadCell}>Teléfono</th>
              <th className={registryTableHeadCell}>Origen</th>
              <th className={registryTableHeadCell}>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr
                key={c.id}
                className={registryTableRowClickable}
                onClick={() => router.push(`/dashboard/crm/contactos/${c.id}`)}
              >
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-[#a5a5ff] shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-white">{c.name}</div>
                      {c.email && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" /> {c.email}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className={`${registryTableCell} text-sm text-gray-300`}>
                  <div>{c.company || "—"}</div>
                  {c.job_title && <div className="text-xs text-gray-500">{c.job_title}</div>}
                </td>
                <td className={`${registryTableCell} text-sm font-mono text-gray-300`}>
                  {c.phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span> : "—"}
                </td>
                <td className={`${registryTableCell} text-xs text-gray-400`}>{c.source || "—"}</td>
                <td className={`${registryTableCell} text-xs text-gray-500 whitespace-nowrap`}>
                  {formatCrmDateTime(c.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
