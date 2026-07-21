"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Pencil } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { AccountStatus } from "@/types/rbac";
import type { OrgMemberRoleSlug } from "@/lib/admin-provisioning";

export interface AdminUserFormValues {
  email: string;
  full_name: string;
  password: string;
  status: AccountStatus;
  create_org: boolean;
  organization_id: string;
  org_name: string;
  role_slug: OrgMemberRoleSlug;
}

export interface AdminOrgOption {
  id: string;
  name: string;
  slug: string;
}

interface AdminUserModalProps {
  open: boolean;
  mode: "create" | "edit";
  organizations?: AdminOrgOption[];
  initial?: Partial<AdminUserFormValues> & { email?: string; is_protected?: boolean };
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: AdminUserFormValues) => void;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "suspended", label: "Suspendido" },
  { value: "disabled", label: "Desactivado" },
];

const ROLE_OPTIONS = [
  { value: "org_admin", label: "Administrador" },
  { value: "manager", label: "Gerente" },
  { value: "advisor", label: "Asesor" },
  { value: "viewer", label: "Solo lectura" },
];

export function AdminUserModal({
  open,
  mode,
  organizations = [],
  initial,
  saving,
  onClose,
  onSubmit,
}: AdminUserModalProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [createOrg, setCreateOrg] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [roleSlug, setRoleSlug] = useState<OrgMemberRoleSlug>("advisor");

  useEffect(() => {
    if (open) {
      setEmail(initial?.email ?? "");
      setFullName(initial?.full_name ?? "");
      setPassword("");
      setStatus((initial?.status as AccountStatus) ?? "active");
      setCreateOrg(initial?.create_org ?? false);
      setOrganizationId(initial?.organization_id ?? organizations[0]?.id ?? "");
      setOrgName(initial?.org_name ?? "");
      setRoleSlug(initial?.role_slug ?? "advisor");
    }
  }, [open, initial, organizations]);

  if (!open) return null;

  const isEdit = mode === "edit";
  const protectedUser = initial?.is_protected === true;

  const canSubmit =
    email.trim() &&
    (isEdit || createOrg || organizationId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] sticky top-0 bg-[#12131a] z-10">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-[#5b5bf6]" /> : <UserPlus className="w-5 h-5 text-[#5b5bf6]" />}
            <h2 className="text-lg font-semibold">{isEdit ? "Editar usuario" : "Agregar usuario"}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!isEdit && (
            <p className="text-xs text-gray-500 leading-relaxed">
              Agrega un miembro a una organización existente. Para un cliente nuevo, crea primero la organización en Organizaciones.
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isEdit}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
            />
          </div>
          {isEdit ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Nueva contraseña (opcional)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Dejar vacío para no cambiar"
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Contraseña (opcional)</label>
                <input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Se genera automáticamente si queda vacío"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createOrg}
                  onChange={e => setCreateOrg(e.target.checked)}
                  className="rounded border-white/20"
                />
                Crear nueva organización (será propietario)
              </label>

              {createOrg ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Nombre de la nueva organización</label>
                  <input
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="Ej. Milhojaldres"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Organización</label>
                    {organizations.length === 0 ? (
                      <p className="text-xs text-amber-400/90">
                        No hay organizaciones. Crea una en Organizaciones o marca la opción de nueva organización.
                      </p>
                    ) : (
                      <NoovaSelect
                        value={organizationId}
                        onChange={setOrganizationId}
                        allowEmpty={false}
                        options={organizations.map(o => ({
                          value: o.id,
                          label: o.name,
                        }))}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Rol en la organización</label>
                    <NoovaSelect
                      value={roleSlug}
                      onChange={v => setRoleSlug(v as OrgMemberRoleSlug)}
                      allowEmpty={false}
                      options={ROLE_OPTIONS}
                    />
                  </div>
                </>
              )}
            </>
          )}
          {isEdit && !protectedUser && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Estado</label>
              <NoovaSelect
                value={status}
                onChange={v => setStatus(v as AccountStatus)}
                options={STATUS_OPTIONS}
                allowEmpty={false}
              />
            </div>
          )}
          {protectedUser && (
            <p className="text-xs text-amber-400/90">Usuario superadministrador protegido — puedes editar nombre y contraseña.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08] sticky bottom-0 bg-[#12131a]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={() =>
              onSubmit({
                email: email.trim(),
                full_name: fullName.trim(),
                password: password.trim(),
                status,
                create_org: createOrg,
                organization_id: organizationId,
                org_name: orgName.trim(),
                role_slug: roleSlug,
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}
