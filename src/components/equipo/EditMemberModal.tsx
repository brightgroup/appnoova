"use client";

import { useEffect, useState } from "react";
import { X, Pencil } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";

interface RoleOption {
  id: string;
  name: string;
  slug: string;
}

export interface EditMemberValues {
  member_id: string;
  email: string;
  full_name: string;
  role_id: string;
  password?: string;
}

interface EditMemberModalProps {
  open: boolean;
  member: EditMemberValues | null;
  roles: RoleOption[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (data: EditMemberValues) => void;
}

export function EditMemberModal({
  open,
  member,
  roles,
  saving,
  onClose,
  onSubmit,
}: EditMemberModalProps) {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");

  useEffect(() => {
    if (open && member) {
      setFullName(member.full_name ?? "");
      setPassword("");
      setRoleId(member.role_id);
    }
  }, [open, member]);

  if (!open || !member) return null;

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));
  if (member.role_id && !roleOptions.some((o) => o.value === member.role_id)) {
    roleOptions.unshift({ value: member.role_id, label: "Rol actual" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[var(--nv-bg-surface,#12131a)] border border-[var(--nv-border,white/10)] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--nv-border,white/08)]">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text,white)]">Editar miembro</h2>
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
              value={member.email}
              readOnly
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre del miembro"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nueva contraseña (opcional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dejar vacío para no cambiar"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Rol</label>
            <NoovaSelect
              value={roleId}
              onChange={setRoleId}
              options={roleOptions}
              allowEmpty={false}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--nv-border,white/08)]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={!roleId || saving}
            onClick={() =>
              onSubmit({
                ...member,
                full_name: fullName.trim(),
                role_id: roleId,
                password: password.trim() || undefined,
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
