"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, RefreshCw, UserPlus, Shield, CheckCircle,
  PauseCircle, Trash2, Mail, AlertCircle, Loader2, ChevronLeft, MoreVertical, Pencil
} from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import { InviteMemberModal } from "@/components/equipo/InviteMemberModal";
import { EditMemberModal, type EditMemberValues } from "@/components/equipo/EditMemberModal";
import { NoovaAnchoredMenu } from "@/components/ui/NoovaAnchoredMenu";
import { NoovaListMenuItem } from "@/components/ui/NoovaSelect";
import {
  registryPage, registryToolbar, registryContent,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell, registryTableCellFirst, registryTableCellMuted,
  registryTableLoading, registryTableEmpty, textMuted, btnPrimary
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";
import { ORG_SYSTEM_ROLE_LABELS, type OrgSystemRoleSlug } from "@/types/rbac";

interface MemberRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: string;
  joined_at: string;
  role_id: string;
  role_slug?: string;
  role_name?: string;
  is_owner: boolean;
  is_self: boolean;
}

interface InviteRow {
  id: string;
  email: string;
  role_name?: string;
  expires_at: string;
}

interface RoleOption {
  id: string;
  slug: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  suspended: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  invited: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  disabled: "bg-red-500/20 text-red-400 border-red-500/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EquipoPage() {
  const { flags, orgName: permOrgName, loading: permLoading, can } = useOrgPermissions();
  const canManage = flags.can_manage_team;
  const canAdmin = flags.can_admin_team;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [seatLimit, setSeatLimit] = useState<{ used: number; max: number | null; remaining: number | null } | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<EditMemberValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const forbidden = !permLoading && !can("org_users", "view");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [membersRes, rolesRes] = await Promise.all([
      authFetch("/api/org/members"),
      authFetch("/api/org/roles"),
    ]);

    const membersJson = await membersRes.json();
    const rolesJson = await rolesRes.json();

    if (!membersRes.ok) {
      setError(membersJson.error ?? "Error al cargar miembros");
    } else {
      setMembers(membersJson.members ?? []);
      setInvites(membersJson.invites ?? []);
      if (membersJson.seats) {
        setSeatLimit({
          used: membersJson.seats.used ?? 0,
          max: membersJson.seats.max ?? null,
          remaining: membersJson.seats.remaining ?? null,
        });
      }
    }
    if (rolesRes.ok) setRoles(rolesJson.roles ?? []);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(data: { email: string; role_id: string; full_name: string; password?: string }) {
    setSaving(true);
    const res = await authFetch("/api/org/members", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (res.ok) {
      setModalOpen(false);
      await load();
    } else {
      alert(json.error ?? "Error al agregar");
    }
    setSaving(false);
  }

  async function handleEdit(data: EditMemberValues) {
    setSaving(true);
    const res = await authFetch("/api/org/members", {
      method: "PATCH",
      body: JSON.stringify({
        member_id: data.member_id,
        role_id: data.role_id,
        full_name: data.full_name,
        password: data.password,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setEditMember(null);
      await load();
    } else {
      alert(json.error ?? "Error al guardar");
    }
    setSaving(false);
  }

  async function setMemberStatus(memberId: string, status: string) {
    setBusyId(memberId);
    const res = await authFetch("/api/org/members", {
      method: "PATCH",
      body: JSON.stringify({ member_id: memberId, status }),
    });
    if (res.ok) await load();
    else {
      const json = await res.json();
      alert(json.error ?? "Error");
    }
    setBusyId(null);
  }

  async function removeMember(memberId: string) {
    if (!confirm("¿Quitar a este miembro del equipo?")) return;
    setBusyId(memberId);
    const res = await authFetch(`/api/org/members?member_id=${memberId}`, { method: "DELETE" });
    if (res.ok) await load();
    else {
      const json = await res.json();
      alert(json.error ?? "Error");
    }
    setBusyId(null);
  }

  async function cancelInvite(inviteId: string) {
    setBusyId(inviteId);
    const res = await authFetch(`/api/org/members?invite_id=${inviteId}`, { method: "DELETE" });
    if (res.ok) await load();
    setBusyId(null);
  }

  const filtered = members.filter((m) =>
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.role_name?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = useRegistryPagination(filtered.length, search);
  const pageRows = pagination.pageRows(filtered);
  const seatsFull = seatLimit?.remaining === 0;
  const orgName = permOrgName;

  if (permLoading) {
    return (
      <div className={registryPage}>
        <div className={registryTableLoading}>
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando equipo…
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className={registryPage}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
          <AlertCircle className="w-10 h-10 text-amber-400 mb-3" />
          <h1 className="text-lg font-semibold mb-2">Sin acceso al equipo</h1>
          <p className={`text-sm ${textMuted} max-w-md`}>
            Tu rol no tiene permiso para ver usuarios de la organización. Contacta al administrador de tu cuenta.
          </p>
          <Link href="/dashboard" className="mt-4 text-sm text-[#5b5bf6] hover:underline">
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={registryPage}>
      <div className={registryToolbar}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-1.5 hover:bg-white/[.06] rounded-lg transition-colors text-gray-400 hover:text-white shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Equipo</h1>
            <p className={`text-xs ${textMuted} mt-0.5`}>
              {orgName ? `${orgName} · ` : ""}
              {members.length} miembro{members.length !== 1 ? "s" : ""}
              {invites.length > 0 &&
                ` · ${invites.length} invitación${invites.length !== 1 ? "es" : ""} pendiente${invites.length !== 1 ? "s" : ""}`}
              {seatLimit?.max != null &&
                ` · ${seatLimit.used}/${seatLimit.max} usuarios del plan`}
              {seatLimit?.max != null && seatsFull &&
                " · límite alcanzado"}
              {seatLimit?.max == null && seatLimit != null &&
                ` · usuarios ilimitados`}
            </p>
          </div>
        </div>
      </div>

      <div className={registryContent}>
        {invites.length > 0 && (
          <div className="mb-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
            <p className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Invitaciones pendientes
            </p>
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between text-sm text-gray-400">
                  <span>{inv.email} · {inv.role_name ?? "—"}</span>
                  {canAdmin && (
                    <button
                      type="button"
                      onClick={() => cancelInvite(inv.id)}
                      disabled={busyId === inv.id}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      {busyId === inv.id ? "…" : "Cancelar"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {seatsFull && canManage && (
          <div className="mb-4 p-4 rounded-xl border border-amber-500/25 bg-amber-500/10">
            <p className="text-sm text-amber-200">
              Tu plan permite hasta {seatLimit?.max} usuarios y ya están en uso. Para agregar gerentes o asesores,{" "}
              <Link href="/dashboard/facturacion" className="text-[#5b5bf6] hover:underline font-medium">
                actualiza el plan en Facturación
              </Link>
              .
            </p>
          </div>
        )}

        <RegistryTableLayout
          search={search}
          onSearchChange={setSearch}
          onRefresh={load}
          refreshing={loading}
          error={error || undefined}
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                disabled={seatsFull}
                className={`${btnPrimary} flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <UserPlus className="w-4 h-4" />
                Agregar miembro
              </button>
            ) : undefined
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
              label="miembros"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando equipo…
            </div>
          ) : filtered.length === 0 ? (
            <div className={registryTableEmpty}>No hay miembros en el equipo</div>
          ) : (
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Miembro</th>
                  <th className={registryTableHeadCell}>Rol</th>
                  <th className={registryTableHeadCell}>Estado</th>
                  <th className={registryTableHeadCell}>Desde</th>
                  {canManage && <th className={registryTableHeadCell}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((m) => {
                  const badge = STATUS_BADGE[m.status] ?? STATUS_BADGE.active;
                  const roleLabel =
                    m.role_name ??
                    (m.role_slug ? ORG_SYSTEM_ROLE_LABELS[m.role_slug as OrgSystemRoleSlug] : "—");
                  return (
                    <tr key={m.id} className={registryTableRow}>
                      <td className={registryTableCellFirst}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                            m.is_owner ? "bg-[#5b5bf6]/20 text-[#5b5bf6]" : "bg-white/[.08] text-gray-400"
                          }`}>
                            {(m.full_name ?? m.email)?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {m.full_name ?? m.email.split("@")[0]}
                              {m.is_self && <span className="ml-1 text-xs text-gray-500">(tú)</span>}
                            </p>
                            <p className="text-xs text-gray-600">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={registryTableCell}>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-white/[.08] text-gray-300">
                          {m.is_owner ? <Shield className="w-3 h-3 text-[#5b5bf6]" /> : null}
                          {roleLabel}
                        </span>
                      </td>
                      <td className={registryTableCell}>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${badge}`}>
                          {m.status === "active" ? "Activo" : m.status}
                        </span>
                      </td>
                      <td className={registryTableCellMuted}>{formatDate(m.joined_at)}</td>
                      {canManage && (
                        <td className={registryTableCell}>
                          {busyId === m.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-[#5b5bf6]" />
                          ) : m.is_owner ? (
                            <span className="text-xs text-gray-600">Propietario</span>
                          ) : (
                            <NoovaAnchoredMenu
                              open={actionMenuId === m.id}
                              onClose={() => setActionMenuId(null)}
                              menuClassName="w-48"
                              anchor={
                                <button
                                  type="button"
                                  onClick={() => setActionMenuId(p => (p === m.id ? null : m.id))}
                                  className="p-1.5 rounded-lg border border-white/[.08] text-gray-400 hover:text-white"
                                  title="Acciones"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              }
                            >
                              <NoovaListMenuItem
                                onClick={() => {
                                  setActionMenuId(null);
                                  setEditMember({
                                    member_id: m.id,
                                    email: m.email,
                                    full_name: m.full_name ?? "",
                                    role_id: m.role_id,
                                  });
                                }}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Pencil className="w-3.5 h-3.5" /> Editar
                                </span>
                              </NoovaListMenuItem>
                              {canAdmin && m.status === "active" && (
                                <NoovaListMenuItem
                                  onClick={() => {
                                    setActionMenuId(null);
                                    void setMemberStatus(m.id, "suspended");
                                  }}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <PauseCircle className="w-3.5 h-3.5" /> Suspender
                                  </span>
                                </NoovaListMenuItem>
                              )}
                              {canAdmin && m.status === "suspended" && (
                                <NoovaListMenuItem
                                  onClick={() => {
                                    setActionMenuId(null);
                                    void setMemberStatus(m.id, "active");
                                  }}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <CheckCircle className="w-3.5 h-3.5" /> Activar
                                  </span>
                                </NoovaListMenuItem>
                              )}
                              {canAdmin && (
                                <NoovaListMenuItem
                                  onClick={() => {
                                    setActionMenuId(null);
                                    void removeMember(m.id);
                                  }}
                                >
                                  <span className="inline-flex items-center gap-2 text-red-400">
                                    <Trash2 className="w-3.5 h-3.5" /> Quitar del equipo
                                  </span>
                                </NoovaListMenuItem>
                              )}
                            </NoovaAnchoredMenu>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>
      </div>

      <InviteMemberModal
        open={modalOpen}
        roles={roles}
        saving={saving}
        seatsRemaining={seatLimit?.remaining ?? null}
        onClose={() => setModalOpen(false)}
        onSubmit={handleInvite}
      />

      <EditMemberModal
        open={editMember != null}
        member={editMember}
        roles={roles}
        saving={saving}
        onClose={() => setEditMember(null)}
        onSubmit={handleEdit}
      />
    </div>
  );
}
