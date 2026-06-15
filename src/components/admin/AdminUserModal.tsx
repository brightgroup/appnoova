"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Pencil } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { AccountStatus } from "@/types/rbac";

export interface AdminUserFormValues {
  email: string;
  full_name: string;
  password: string;
  status: AccountStatus;
  create_org: boolean;
}

interface AdminUserModalProps {
  open: boolean;
  mode: "create" | "edit";
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

export function AdminUserModal({
  open,
  mode,
  initial,
  saving,
  onClose,
  onSubmit,
}: AdminUserModalProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [createOrg, setCreateOrg] = useState(true);

  useEffect(() => {
    if (open) {
      setEmail(initial?.email ?? "");
      setFullName(initial?.full_name ?? "");
      setPassword("");
      setStatus((initial?.status as AccountStatus) ?? "active");
      setCreateOrg(initial?.create_org ?? true);
    }
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === "edit";
  const protectedUser = initial?.is_protected === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-[#5b5bf6]" /> : <UserPlus className="w-5 h-5 text-[#5b5bf6]" />}
            <h2 className="text-lg font-semibold">{isEdit ? "Editar usuario" : "Crear usuario"}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isEdit}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
            />
          </div>
          {!isEdit && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Contraseña (opcional)</label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Se genera automáticamente si queda vacío"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createOrg}
                  onChange={(e) => setCreateOrg(e.target.checked)}
                  className="rounded border-white/20"
                />
                Crear organización para este usuario
              </label>
            </>
          )}
          {isEdit && !protectedUser && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Estado</label>
              <NoovaSelect
                value={status}
                onChange={(v) => setStatus(v as AccountStatus)}
                options={STATUS_OPTIONS}
                allowEmpty={false}
              />
            </div>
          )}
          {protectedUser && (
            <p className="text-xs text-amber-400/90">Usuario superadministrador protegido — solo puedes editar el nombre.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={(!isEdit && !email.trim()) || saving}
            onClick={() =>
              onSubmit({
                email: email.trim(),
                full_name: fullName.trim(),
                password: password.trim(),
                status,
                create_org: createOrg,
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
