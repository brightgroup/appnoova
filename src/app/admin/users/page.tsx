"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Shield, RefreshCw, CheckCircle, Clock, MailCheck, AlertCircle,
  Phone, Plus, Pencil, PauseCircle, Ban, Trash2, MoreHorizontal
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { AdminUserModal, type AdminUserFormValues } from "@/components/admin/AdminUserModal";
import { NoovaListMenu, NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import {
  adminRegistryPage, registryToolbar, adminRegistryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty, textMuted, btnPrimary
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import type { AccountStatus } from "@/types/rbac";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  nombre?: string | null;
  status: AccountStatus;
  is_protected?: boolean;
  is_super_admin?: boolean;
  email_confirmed?: boolean;
  created_at: string;
  memberships?: { organizations?: { name: string } | null; roles?: { name: string } | null }[];
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",      color: "bg-green-500/20 text-green-400 border-green-500/30" },
  suspended: { label: "Suspendido",  color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  disabled:  { label: "Desactivado", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  invited:   { label: "Invitado",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; user?: UserRow } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/admin/rbac/users");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Error al cargar");
    else setUsers(json.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function confirmUser(userId: string) {
    setBusyId(userId);
    const res = await authFetch("/api/admin/confirm-user", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    const json = await res.json();
    if (json.success) await fetchUsers();
    else alert(json.error ?? "Error al verificar");
    setBusyId(null);
  }

  async function setStatus(userId: string, status: AccountStatus) {
    setBusyId(userId);
    setMenuId(null);
    const res = await authFetch(`/api/admin/rbac/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (res.ok) await fetchUsers();
    else alert((await res.json()).error ?? "Error");
    setBusyId(null);
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`¿Eliminar permanentemente a ${user.email}? Esta acción no se puede deshacer.`)) return;
    setBusyId(user.id);
    const res = await authFetch(`/api/admin/rbac/users/${user.id}`, { method: "DELETE" });
    if (res.ok) await fetchUsers();
    else alert((await res.json()).error ?? "Error");
    setBusyId(null);
  }

  async function handleModalSubmit(values: AdminUserFormValues) {
    setSaving(true);
    if (modal?.mode === "create") {
      const res = await authFetch("/api/admin/rbac/users", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (res.ok) {
        setModal(null);
        await fetchUsers();
        if (json.temporary_password) {
          alert(`Usuario creado.\nContraseña temporal: ${json.temporary_password}\nCompártela de forma segura.`);
        }
      } else alert(json.error ?? "Error");
    } else if (modal?.user) {
      const res = await authFetch(`/api/admin/rbac/users/${modal.user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ full_name: values.full_name, status: values.status }),
      });
      if (res.ok) {
        setModal(null);
        await fetchUsers();
      } else alert((await res.json()).error ?? "Error");
    }
    setSaving(false);
  }

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? u.nombre ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);

  return (
    <div className={adminRegistryPage}>
      <div className={`${registryToolbar} flex items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-[#5b5bf6]" />
            <h1 className="text-xl font-bold tracking-tight">Usuarios</h1>
          </div>
          <p className={`text-xs ${textMuted}`}>{users.length} registrados en la plataforma</p>
        </div>
      </div>

      <div className={adminRegistryContent}>
        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          onRefresh={fetchUsers}
          refreshing={loading}
          error={error || undefined}
          action={
            <button type="button" onClick={() => setModal({ mode: "create" })} className={`${btnPrimary} flex items-center gap-2 shrink-0`}>
              <Plus className="w-4 h-4" /> Crear usuario
            </button>
          }
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
              label="usuarios"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className={registryTableEmpty}>No hay usuarios</div>
          ) : (
            <table className={`${registryTable} min-w-[960px]`}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Usuario</th>
                  <th className={registryTableHeadCell}>Organización</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Registro</th>
                  <th className={registryTableHeadCell}>Email</th>
                  <th className={registryTableHeadCell}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const name = u.full_name ?? u.nombre ?? "—";
                  const badge = STATUS_BADGE[u.status] ?? STATUS_BADGE.active;
                  const orgLabel = u.memberships?.[0]?.organizations?.name ?? "—";
                  const protected_ = u.is_protected || u.is_super_admin;
                  return (
                    <tr key={u.id} className={registryTableRow}>
                      <td className={registryTableCellFirst}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                            protected_ ? "bg-[#5b5bf6]/20 text-[#5b5bf6]" : "bg-white/[.08] text-gray-400"
                          }`}>
                            {name[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white flex items-center gap-1.5">
                              {name}
                              {protected_ && <Shield className="w-3 h-3 text-[#5b5bf6]" aria-label="Superadmin" />}
                            </p>
                            <p className="text-xs text-gray-600">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${registryTableCell} text-sm text-gray-400`}>{orgLabel}</td>
                      <td className={registryTableCell}>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td className={registryTableCellMuted}>
                        <span className="inline-flex items-center gap-1 text-xs"><Clock className="w-3 h-3" />{formatDate(u.created_at)}</span>
                      </td>
                      <td className={registryTableCell}>
                        {u.email_confirmed === false ? (
                          <span className="text-xs text-amber-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Pendiente</span>
                        ) : (
                          <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> OK</span>
                        )}
                      </td>
                      <td className={registryTableCell}>
                        {busyId === u.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-[#5b5bf6]" />
                        ) : (
                          <div className="flex items-center gap-1">
                            <Link href={`/admin/telephony?user_id=${u.id}`} className="p-1.5 rounded-lg text-[#5b5bf6] hover:bg-[#5b5bf6]/10" title="Línea">
                              <Phone className="w-4 h-4" />
                            </Link>
                            {u.email_confirmed === false && (
                              <button type="button" onClick={() => confirmUser(u.id)} className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10" title="Verificar email">
                                <MailCheck className="w-4 h-4" />
                              </button>
                            )}
                            <div className="relative">
                              <button type="button" onClick={() => setMenuId(menuId === u.id ? null : u.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-white/[.08]">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {menuId === u.id && (
                                <NoovaListMenu className="absolute right-0 top-full mt-1 w-44 z-20">
                                  <NoovaListMenuItem onClick={() => { setMenuId(null); setModal({ mode: "edit", user: u }); }}>
                                    <span className="flex items-center gap-2"><Pencil className="w-3.5 h-3.5" /> Editar</span>
                                  </NoovaListMenuItem>
                                  {!protected_ && u.status !== "active" && (
                                    <NoovaListMenuItem onClick={() => setStatus(u.id, "active")}>
                                      <span className="flex items-center gap-2 text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Activar</span>
                                    </NoovaListMenuItem>
                                  )}
                                  {!protected_ && u.status === "active" && (
                                    <NoovaListMenuItem onClick={() => setStatus(u.id, "suspended")}>
                                      <span className="flex items-center gap-2 text-amber-400"><PauseCircle className="w-3.5 h-3.5" /> Suspender</span>
                                    </NoovaListMenuItem>
                                  )}
                                  {!protected_ && u.status !== "disabled" && (
                                    <NoovaListMenuItem onClick={() => setStatus(u.id, "disabled")}>
                                      <span className="flex items-center gap-2 text-red-400"><Ban className="w-3.5 h-3.5" /> Desactivar</span>
                                    </NoovaListMenuItem>
                                  )}
                                  {!protected_ && (
                                    <NoovaListMenuItem danger onClick={() => { setMenuId(null); deleteUser(u); }}>
                                      <span className="flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Eliminar</span>
                                    </NoovaListMenuItem>
                                  )}
                                </NoovaListMenu>
                              )}
                            </div>
                          </div>
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

      <AdminUserModal
        open={!!modal}
        mode={modal?.mode ?? "create"}
        initial={modal?.user ? {
          email: modal.user.email,
          full_name: modal.user.full_name ?? modal.user.nombre ?? "",
          status: modal.user.status,
          is_protected: modal.user.is_protected,
        } : undefined}
        saving={saving}
        onClose={() => setModal(null)}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
