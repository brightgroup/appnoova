"use client";

import { useEffect, useState } from "react";
import { X, Lock } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import {
  ORG_MODULE_LABELS,
  ORG_PERMISSION_MODULE_KEYS,
  PERMISSION_LEVEL_LABELS,
  countActivePermissions,
  type PermissionLevel,
} from "@/types/rbac";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";

export interface RoleEditorValues {
  name: string;
  description: string;
  permissions: Record<string, PermissionLevel>;
}

interface RoleEditorModalProps {
  open: boolean;
  title: string;
  initial: RoleEditorValues;
  readOnly?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: RoleEditorValues) => void;
}

const LEVEL_OPTIONS = (["none", "view", "edit", "manage"] as PermissionLevel[]).map((v) => ({
  value: v,
  label: PERMISSION_LEVEL_LABELS[v],
}));

export function RoleEditorModal({
  open,
  title,
  initial,
  readOnly,
  saving,
  onClose,
  onSave,
}: RoleEditorModalProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [permissions, setPermissions] = useState(initial.permissions);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setDescription(initial.description);
      setPermissions(initial.permissions);
    }
  }, [open, initial]);

  if (!open) return null;

  const permCount = countActivePermissions(permissions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              placeholder="Escribe aquí"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              placeholder="Escribe aquí"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600 resize-none disabled:opacity-60"
            />
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Permisos</p>
            <div className="space-y-2">
              {ORG_PERMISSION_MODULE_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[.03] border border-white/[.06]"
                >
                  <span className="text-sm text-gray-300">{ORG_MODULE_LABELS[key]}</span>
                  <NoovaSelect
                    value={permissions[key] ?? "none"}
                    onChange={(v) =>
                      setPermissions((prev) => ({ ...prev, [key]: v as PermissionLevel }))
                    }
                    options={LEVEL_OPTIONS}
                    allowEmpty={false}
                    disabled={readOnly}
                    className="w-36"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[.08]">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" />
            {permCount} permiso{permCount !== 1 ? "s" : ""} seleccionado{permCount !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancelar
            </button>
            {!readOnly && (
              <button
                type="button"
                disabled={!name.trim() || saving}
                onClick={() => onSave({ name: name.trim(), description: description.trim(), permissions })}
                className={btnPrimary}
              >
                {saving ? "Guardando…" : "Guardar rol"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
