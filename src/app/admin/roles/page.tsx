"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, RefreshCw, Plus, Pencil, Lock } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";
import {
  ORG_PERMISSION_MODULE_KEYS,
  type PermissionLevel,
  countActivePermissions,
} from "@/types/rbac";
import {
  adminRegistryPage, adminRegistryContent,
  registryTableLoading, registryTableEmpty, btnPrimary,
  registryTable, registryTableHead, registryTableHeadRow, registryTableHeadCell,
  registryTableRow, registryTableCell
} from "@/lib/brand-ui";
import { RegistryTableLayout } from "@/components/ui/RegistryTableLayout";
import { RegistryTablePagination } from "@/components/ui/RegistryTablePagination";
import { useRegistryPagination } from "@/hooks/useRegistryPagination";
import { RoleEditorModal, type RoleEditorValues } from "@/components/admin/RoleEditorModal";
import { AdminPageToolbar } from "@/components/admin/AdminPageToolbar";

interface RoleRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: Record<string, PermissionLevel>;
}

function emptyPermissions(): Record<string, PermissionLevel> {
  return Object.fromEntries(ORG_PERMISSION_MODULE_KEYS.map((k) => [k, "none" as PermissionLevel]));
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await authFetch("/api/admin/roles");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Error al cargar");
    } else {
      setRoles(json.roles ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(role: RoleRow) {
    setEditing(role);
    setModalOpen(true);
  }

  async function handleSave(values: RoleEditorValues) {
    setSaving(true);
    const isNew = !editing;
    const res = isNew
      ? await authFetch("/api/admin/roles", {
          method: "POST",
          body: JSON.stringify(values),
        })
      : await authFetch(`/api/admin/roles/${editing!.id}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });

    if (res.ok) {
      setModalOpen(false);
      await fetchRoles();
    } else {
      const json = await res.json();
      alert(json.error ?? "Error al guardar");
    }
    setSaving(false);
  }

  const modalInitial: RoleEditorValues = editing
    ? {
        name: editing.name,
        description: editing.description ?? "",
        permissions: { ...emptyPermissions(), ...editing.permissions },
      }
    : { name: "", description: "", permissions: emptyPermissions() };

  const pagination = useRegistryPagination(roles.length);
  const pageRows = pagination.pageRows(roles);

  return (
    <div className={adminRegistryPage}>
      <AdminPageToolbar
        icon={Shield}
        title="Roles de organización"
        subtitle="Configura qué ve y hace cada rol en el dashboard. Los cambios se aplican a todas las organizaciones."
        onRefresh={fetchRoles}
        refreshing={loading}
        action={
          <button type="button" onClick={openCreate} className={`${btnPrimary} flex items-center gap-2 shrink-0`}>
            <Plus className="w-4 h-4" />
            Crear rol
          </button>
        }
      />

      <div className={`${adminRegistryContent} space-y-4`}>
        <div className="p-4 rounded-xl bg-[#5b5bf6]/10 border border-[#5b5bf6]/25">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[#5b5bf6] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Superadministrador</p>
              <p className="text-xs text-gray-400 mt-1">
                Solo <strong className="text-gray-300">admin@noova360.com</strong> accede a /admin y tiene control total.
                Edita aquí Asesor, Administrador, etc.: facturación, inbox, agentes, CRM y más.
                Al guardar, se sincroniza con todos los clientes; luego asignas el rol en cada org desde Equipo.
              </p>
            </div>
          </div>
        </div>

        <RegistryTableLayout error={error || undefined}
          footer={roles.length > 0 ? (
            <RegistryTablePagination
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSafe={pagination.pageSafe}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              label="roles"
            />
          ) : undefined}
        >
          {loading ? (
            <div className={registryTableLoading}>
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando roles...
            </div>
          ) : roles.length === 0 ? (
            <div className={registryTableEmpty}>No hay roles configurados</div>
          ) : (
            <table className={registryTable}>
              <thead className={registryTableHead}>
                <tr className={registryTableHeadRow}>
                  <th className={registryTableHeadCell}>Rol</th>
                  <th className={registryTableHeadCell}>Permisos</th>
                  <th className={`${registryTableHeadCell} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((role) => {
                  const permCount = countActivePermissions(role.permissions);
                  return (
                    <tr key={role.id} className={registryTableRow}>
                      <td className={registryTableCell}>
                        <p className="text-sm font-semibold text-white">{role.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {role.description ?? role.slug}
                          {role.slug === "org_admin" && (
                            <span className="ml-2 text-[#5b5bf6]">· Empresa suscriptora</span>
                          )}
                        </p>
                        {role.is_system && (
                          <p className="text-xs text-gray-600 mt-1">Rol de sistema</p>
                        )}
                      </td>
                      <td className={registryTableCell}>
                        <span className="text-xs text-gray-400">
                          {permCount} permiso{permCount !== 1 ? "s" : ""} activo{permCount !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className={`${registryTableCell} text-right`}>
                        <button
                          type="button"
                          onClick={() => openEdit(role)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[.04] border border-white/[.08] text-xs text-gray-300 hover:text-white"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Configurar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </RegistryTableLayout>
      </div>

      <RoleEditorModal
        open={modalOpen}
        title={editing ? `Configurar: ${editing.name}` : "Crear rol"}
        initial={modalInitial}
        saving={saving}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
