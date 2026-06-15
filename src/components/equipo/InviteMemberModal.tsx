"use client";

import { useEffect, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";

interface RoleOption {
  id: string;
  name: string;
  slug: string;
}

interface InviteMemberModalProps {
  open: boolean;
  roles: RoleOption[];
  saving?: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; role_id: string; full_name: string }) => void;
}

export function InviteMemberModal({ open, roles, saving, onClose, onSubmit }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setFullName("");
      setRoleId(roles.find((r) => r.slug === "advisor")?.id ?? roles[0]?.id ?? "");
    }
  }, [open, roles]);

  if (!open) return null;

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[var(--nv-bg-surface,#12131a)] border border-[var(--nv-border,white/10)] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--nv-border,white/08)]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#5b5bf6]" />
            <h2 className="text-lg font-semibold text-[var(--nv-text,white)]">Agregar al equipo</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Si el email ya tiene cuenta, se agrega de inmediato. Si no, queda invitación pendiente al registrarse.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor@empresa.com"
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--nv-bg,#0d0e14)] border border-[var(--nv-border,white/12)] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre (opcional)</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nombre del asesor"
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
            disabled={!email.trim() || !roleId || saving}
            onClick={() => onSubmit({ email: email.trim(), role_id: roleId, full_name: fullName.trim() })}
            className={btnPrimary}
          >
            {saving ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
