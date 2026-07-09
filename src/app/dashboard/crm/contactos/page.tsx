"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Settings,
  Trash2,
  User
} from "lucide-react";
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
  registryTableRowSelected,
  registryTableCellFirst,
  registryTableEmpty
} from "@/lib/brand-ui";
import { ChannelListPage } from "@/components/dashboard/ChannelListPage";
import { Badge } from "@/components/ui/Badge";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { formatCrmDateTime } from "@/components/crm/CrmFieldInput";
import {
  FUENTE_ORIGEN_OPTIONS,
  TIPO_RELACION_LABELS,
  VENTANA_WA_LABELS
} from "@/lib/crm-contactability";
import { CONTACT_EXPORT_COLUMNS } from "@/lib/crm-export";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import type { CrmContact, CrmContactFilter } from "@/types/crm";

const FUENTE_LABELS = Object.fromEntries(FUENTE_ORIGEN_OPTIONS.map(o => [o.value, o.label]));

const FILTERS: { id: CrmContactFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "with_whatsapp", label: "Con WhatsApp" },
  { id: "with_phone", label: "Con teléfono" },
  { id: "with_email", label: "Con email" },
  { id: "prospecto", label: "Prospectos" },
  { id: "cliente", label: "Clientes" },
  { id: "recent", label: "Recientes" }
];

function WaBadge({ estado }: { estado: CrmContact["ventana_wa_estado"] }) {
  const cls =
    estado === "abierta"
      ? "bg-emerald-500/15 text-emerald-300"
      : estado === "requiere_plantilla"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-white/[.06] text-gray-500";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`} title={VENTANA_WA_LABELS[estado]}>
      {estado === "abierta" ? "24h" : estado === "requiere_plantilla" ? "HSM" : "—"}
    </span>
  );
}

function TableCheckbox({
  checked,
  indeterminate,
  onChange
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-4 h-4 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
        checked || indeterminate
          ? "bg-[#a5a5ff] border-[#a5a5ff]"
          : "border-white/20 bg-white/[.04] hover:border-white/30"
      }`}
    >
      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      {indeterminate && !checked && <span className="w-2 h-0.5 bg-white rounded-full" />}
    </button>
  );
}

export default function CrmContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CrmContactFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(true);
  const skipSearchReload = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const headers = await getAuthHeaders();
    const url = search.trim()
      ? `/api/crm/contacts?q=${encodeURIComponent(search.trim())}`
      : "/api/crm/contacts";
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (res.status === 503 && data.dbReady === false) {
      setDbReady(false);
      setContacts([]);
    } else if (res.ok) {
      setDbReady(true);
      setContacts(data.contacts ?? []);
      setSelected(prev => {
        const ids = new Set((data.contacts ?? []).map((c: CrmContact) => c.id));
        return new Set([...prev].filter(id => ids.has(id)));
      });
    }
    if (!silent) setLoading(false);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await load();
      if (cancelled) return;

      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/crm/contacts/backfill-whatsapp", {
          method: "POST",
          headers
        });
        if (!cancelled && res.ok) await load(true);
      } catch {
        // sync en background — no bloquear la UI
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipSearchReload.current) {
      skipSearchReload.current = false;
      return;
    }
    void load(true);
  }, [search, load]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (filter === "with_whatsapp") list = list.filter(c => c.whatsapp);
    else if (filter === "with_phone") list = list.filter(c => c.telefono || c.phone);
    else if (filter === "with_email") list = list.filter(c => c.email);
    else if (filter === "prospecto") list = list.filter(c => c.tipo_relacion === "prospecto");
    else if (filter === "cliente") list = list.filter(c => c.tipo_relacion === "cliente");
    else if (filter === "recent") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(c => new Date(c.updated_at).getTime() >= weekAgo);
    }
    return list;
  }, [contacts, filter]);

  const pagination = useRegistryPagination(filtered.length, `${search}-${filter}`);
  const pageRows = pagination.pageRows(filtered);

  const filteredIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const someSelected = filtered.some(c => selected.has(c.id));
  const selectedContacts = useMemo(
    () => contacts.filter(c => selected.has(c.id)),
    [contacts, selected]
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...filteredIds]));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOne = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a «${name}»? Esta acción no se puede deshacer.`)) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/crm/contacts/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setContacts(prev => prev.filter(c => c.id !== id));
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const deleteSelected = async () => {
    if (selectedContacts.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedContacts.length} contacto(s)? Esta acción no se puede deshacer.`)) return;
    setBulkBusy(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/crm/contacts/bulk", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ids: selectedContacts.map(c => c.id) })
    });
    if (res.ok) {
      const ids = new Set(selectedContacts.map(c => c.id));
      setContacts(prev => prev.filter(c => !ids.has(c.id)));
      setSelected(new Set());
    }
    setBulkBusy(false);
  };


  return (
    <ChannelListPage
      title="Contactos"
      description="Personas y empresas — base para leads, inbox y automatizaciones."
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar por nombre, email, teléfono…"
      onRefresh={() => load()}
      refreshing={loading}
      filters={
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <div className={btnFilterGroup}>
            {FILTERS.map(({ id, label }) => (
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
        </div>
      }
      action={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ExportMenu
            filename="contactos"
            sheetName="Contactos"
            columns={CONTACT_EXPORT_COLUMNS}
            rows={filtered}
          />
          <Link href="/dashboard/crm/configuracion" className={btnGhost}>
            <Settings className="w-4 h-4" />
          </Link>
          <Link href="/dashboard/crm/contactos/nuevo" className={`${btnPrimary} w-full sm:w-auto justify-center`}>
            <Plus className="w-4 h-4" /> Nuevo contacto
          </Link>
        </div>
      }
      alerts={
        <>
          {!dbReady && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              La tabla CRM no está lista. Ejecuta las migraciones <code className="text-amber-100">026_crm.sql</code> y{" "}
              <code className="text-amber-100">029_crm_contact_ficha.sql</code> en Supabase.
            </div>
          )}
          {selected.size > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#a5a5ff]/25 bg-[#a5a5ff]/8 px-4 py-3">
              <span className="text-sm text-[#c4c4ff]">
                <span className="font-semibold text-white">{selected.size}</span> seleccionado(s)
              </span>
              <ExportMenu
                filename="contactos-seleccion"
                sheetName="Contactos"
                columns={CONTACT_EXPORT_COLUMNS}
                rows={selectedContacts}
                label="Exportar selección"
                disabled={bulkBusy}
              />
              <button
                type="button"
                disabled={bulkBusy}
                onClick={deleteSelected}
                className={`${btnGhost} text-red-300 hover:text-red-200`}
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-200 ml-auto">
                Limpiar selección
              </button>
            </div>
          ) : null}
        </>
      }
      footer={
        filtered.length > 0 ? (
          <RegistryTablePagination
            total={pagination.total}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            pageSafe={pagination.pageSafe}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            label="contactos"
          />
        ) : undefined
      }
    >
      {filtered.length === 0 ? (
        <div className={registryTableEmpty}>
          {search.trim() || filter !== "all"
            ? "No hay contactos con estos filtros."
            : "Aún no tienes contactos. Se crean automáticamente desde conversaciones WhatsApp, o puedes añadir uno con «Nuevo contacto»."}
        </div>
      ) : (
        <table className={`${registryTable} min-w-[1100px]`}>
          <thead className={registryTableHead}>
            <tr className={registryTableHeadRow}>
              <th className={`${registryTableHeadCell} w-10`}>
                <TableCheckbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} />
              </th>
              <th className={registryTableHeadCell}>Contacto</th>
              <th className={registryTableHeadCell}>Relación</th>
              <th className={registryTableHeadCell}>WhatsApp</th>
              <th className={registryTableHeadCell}>Teléfono</th>
              <th className={registryTableHeadCell}>Ciudad</th>
              <th className={registryTableHeadCell}>Fuente</th>
              <th className={registryTableHeadCell}>Actualizado</th>
              <th className={`${registryTableHeadCell} w-12`} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(c => (
              <tr
                key={c.id}
                className={`${registryTableRowClickable} ${selected.has(c.id) ? registryTableRowSelected : ""}`}
                onClick={() => router.push(`/dashboard/crm/contactos/${c.id}`)}
              >
                <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                  <TableCheckbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                </td>
                <td className={registryTableCellFirst}>
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-[#a5a5ff] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{c.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        {c.email && (
                          <span className="text-xs text-gray-400 flex items-center gap-1 truncate max-w-[180px]">
                            <Mail className="w-3 h-3 shrink-0" /> {c.email}
                          </span>
                        )}
                        {c.organizacion && (
                          <span className="text-xs text-gray-500 truncate max-w-[140px]">{c.organizacion}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={`${registryTableCell} text-xs`}>
                  <Badge variant="neutral">{TIPO_RELACION_LABELS[c.tipo_relacion] ?? c.tipo_relacion}</Badge>
                </td>
                <td className={`${registryTableCell} text-xs`}>
                  {c.whatsapp ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-gray-300" title={VENTANA_WA_LABELS[c.ventana_wa_estado]}>
                        {c.whatsapp}
                      </span>
                      <WaBadge estado={c.ventana_wa_estado} />
                    </div>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className={`${registryTableCell} text-xs font-mono text-gray-300`}>
                  {c.telefono || c.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-gray-500" />
                      {c.telefono || c.phone}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className={`${registryTableCell} text-xs text-gray-400`}>
                  {c.ciudad ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-600" />
                      {c.ciudad}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={`${registryTableCell} text-xs text-gray-400 whitespace-nowrap`}>
                  {FUENTE_LABELS[c.fuente_origen ?? ""] ?? c.fuente_origen ?? "—"}
                </td>
                <td className={`${registryTableCell} text-xs text-gray-500 whitespace-nowrap`}>
                  {formatCrmDateTime(c.updated_at)}
                </td>
                <td className={registryTableCell} onClick={e => e.stopPropagation()}>
                  <NoovaAnchoredMenu
                    open={openMenuId === c.id}
                    onClose={() => setOpenMenuId(null)}
                    menuClassName="min-w-[140px]"
                    anchor={
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenuId(prev => (prev === c.id ? null : c.id));
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[.06]"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    }
                  >
                    <NoovaListMenuItem onClick={() => router.push(`/dashboard/crm/contactos/${c.id}`)}>
                      Abrir ficha
                    </NoovaListMenuItem>
                    <NoovaListMenuItem onClick={() => router.push(`/dashboard/crm/leads/nuevo?contact_id=${c.id}`)}>
                      Crear lead
                    </NoovaListMenuItem>
                    <NoovaListMenuItem
                      danger
                      onClick={() => {
                        setOpenMenuId(null);
                        deleteOne(c.id, c.name);
                      }}
                    >
                      Eliminar
                    </NoovaListMenuItem>
                  </NoovaAnchoredMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChannelListPage>
  );
}
