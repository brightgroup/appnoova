"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, RefreshCw, Users, CheckCircle, PauseCircle, Ban, Trash2,
  Plus, Pencil, MoreHorizontal, Shield
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminOrgModal, type AdminOrgFormValues } from "@/components/admin/AdminOrgModal";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";
import { AdminStatusBadge } from "@/components/admin/admin-table-styles";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import {
  adminRegistryPage, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty, btnPrimary
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import type { AccountStatus } from "@/types/rbac";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: AccountStatus;
  plan: string;
  created_at: string;
  member_count: number;
  is_protected?: boolean;
  owner: { email: string; full_name: string | null } | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; org?: OrgRow } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/admin/organizations");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setOrgs(json.organizations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  async function patchOrg(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setMenuId(null);
    const res = await authFetch(`/api/admin/organizations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (res.ok) await fetchOrgs();
    else alert((await res.json()).error ?? "Error");
    setBusyId(null);
  }

  async function deleteOrg(org: OrgRow) {
    if (!confirm(`¿Eliminar "${org.name}"? Se borrarán miembros, roles y datos vinculados.`)) return;
    setBusyId(org.id);
    const res = await authFetch(`/api/admin/organizations/${org.id}`, { method: "DELETE" });
    if (res.ok) await fetchOrgs();
    else alert((await res.json()).error ?? "Error");
    setBusyId(null);
  }

  async function handleModalSubmit(values: AdminOrgFormValues) {
    setSaving(true);
    if (modal?.mode === "create") {
      const res = await authFetch("/api/admin/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          slug: values.slug || undefined,
          plan: values.plan,
          owner_mode: values.owner_mode,
          owner_email: values.owner_email,
          owner_full_name: values.owner_full_name || undefined,
          owner_password: values.owner_password || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setModal(null);
        await fetchOrgs();
        if (json.temporary_password) {
          alert(
            `Organización creada.\nPropietario: ${values.owner_email}\nContraseña temporal: ${json.temporary_password}\nCompártela de forma segura.`
          );
        }
      } else alert(json.error ?? "Error");
    } else if (modal?.org) {
      const res = await authFetch(`/api/admin/organizations/${modal.org.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          slug: values.slug || undefined,
          plan: values.plan,
          status: values.status,
        }),
      });
      if (res.ok) {
        setModal(null);
        await fetchOrgs();
      } else alert((await res.json()).error ?? "Error");
    }
    setSaving(false);
  }

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.slug.toLowerCase().includes(search.toLowerCase()) ||
    o.owner?.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={Building2}
        title="Organizaciones"
        subtitle={`${orgs.length} cuentas en la plataforma`}
        search={search}
        onSearchChange={setSearch}
        onRefresh={fetchOrgs}
        refreshing={loading}
        action={
          <button type="button" onClick={() => setModal({ mode: "create" })} className={`${btnPrimary} flex items-center gap-2 shrink-0`}>
            <Plus className="w-4 h-4" /> Crear organización
          </button>
        }
      />

      <div className={adminRegistryContent}>
        <RegistryTableLayout
          error={error || undefined}
          footer={filtered.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="organizaciones"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className={registryTableEmpty}>No hay organizaciones</div>
          ) : (
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Organización</th>
                  <th className={registryTableHeadCell}>Propietario</th>
                  <th className={registryTableHeadCell}>Miembros</th>
                  <th className={registryTableHeadCell}>Plan</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Creada</th>
                  <th className={registryTableHeadCell}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => {
                  const protected_ = o.is_protected;
                  return (
                    <tr key={o.id} className={registryTableRow}>
                      <td className={registryTableCellFirst}>
                        <p className="text-sm font-medium text-white flex items-center gap-1.5">
                          {o.name}
                          {protected_ && <Shield className="w-3.5 h-3.5 text-[#5b5bf6]" aria-label="Protegida" />}
                        </p>
                        <p className="text-xs text-gray-600 font-mono">{o.slug}</p>
                      </td>
                      <td className={`${registryTableCell} text-sm text-gray-300`}>
                        {o.owner?.full_name ?? o.owner?.email ?? "—"}
                      </td>
                      <td className={registryTableCell}>
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <Users className="w-3.5 h-3.5" /> {o.member_count}
                        </span>
                      </td>
                      <td className={registryTableCellMuted}>{o.plan}</td>
                      <td className={registryTableCell}>
                        <AdminStatusBadge status={o.status} />
                      </td>
                      <td className={registryTableCellMuted}>{formatDate(o.created_at)}</td>
                      <td className={registryTableCell}>
                        {busyId === o.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-[#5b5bf6]" />
                        ) : (
                          <NoovaAnchoredMenu
                            open={menuId === o.id}
                            onClose={() => setMenuId(null)}
                            menuClassName="w-44"
                            anchor={
                              <button type="button" onClick={() => setMenuId(menuId === o.id ? null : o.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[.08]">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            }
                          >
                            <NoovaListMenuItem onClick={() => { setMenuId(null); setModal({ mode: "edit", org: o }); }}>
                              <span className="flex items-center gap-2"><Pencil className="w-3.5 h-3.5" /> Editar</span>
                            </NoovaListMenuItem>
                            {!protected_ && o.status !== "active" && (
                              <NoovaListMenuItem onClick={() => patchOrg(o.id, { status: "active" })}>
                                <span className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Activar</span>
                              </NoovaListMenuItem>
                            )}
                            {!protected_ && o.status === "active" && (
                              <NoovaListMenuItem onClick={() => patchOrg(o.id, { status: "suspended" })}>
                                <span className="flex items-center gap-2 text-amber-400"><PauseCircle className="w-3.5 h-3.5" /> Suspender</span>
                              </NoovaListMenuItem>
                            )}
                            {!protected_ && o.status !== "disabled" && (
                              <NoovaListMenuItem onClick={() => patchOrg(o.id, { status: "disabled" })}>
                                <span className="flex items-center gap-2 text-red-400"><Ban className="w-3.5 h-3.5" /> Desactivar</span>
                              </NoovaListMenuItem>
                            )}
                            {!protected_ && (
                              <NoovaListMenuItem danger onClick={() => { setMenuId(null); deleteOrg(o); }}>
                                <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Eliminar</span>
                              </NoovaListMenuItem>
                            )}
                          </NoovaAnchoredMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>
      </div>

      <AdminOrgModal
        open={!!modal}
        mode={modal?.mode ?? "create"}
        initial={modal?.org ? {
          name: modal.org.name,
          slug: modal.org.slug,
          plan: modal.org.plan,
          status: modal.org.status,
          is_protected: modal.org.is_protected,
        } : undefined}
        saving={saving}
        onClose={() => setModal(null)}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
