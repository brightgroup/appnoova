"use client";

import { useEffect, useState } from "react";
import { X, Building2, Pencil } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import type { AccountStatus } from "@/types/rbac";

export interface AdminOrgFormValues {
  name: string;
  slug: string;
  plan: string;
  status: AccountStatus;
  owner_email: string;
}

interface AdminOrgModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<AdminOrgFormValues> & { is_protected?: boolean };
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: AdminOrgFormValues) => void;
}

const PLAN_OPTIONS = [
  { value: "explorador", label: "Explorador · Prueba 14 días (15.000 cr)" },
  { value: "esencial", label: "Esencial · $82/mes (350.000 cr)" },
  { value: "crecimiento", label: "Crecimiento · $345/mes (1.500.000 cr)" },
  { value: "escala", label: "Escala · $815/mes (3.800.000 cr)" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Activa" },
  { value: "suspended", label: "Suspendida" },
  { value: "disabled", label: "Desactivada" },
];

export function AdminOrgModal({
  open,
  mode,
  initial,
  saving,
  onClose,
  onSubmit,
}: AdminOrgModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("explorador");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [ownerEmail, setOwnerEmail] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setPlan(initial?.plan ?? "explorador");
      setStatus((initial?.status as AccountStatus) ?? "active");
      setOwnerEmail(initial?.owner_email ?? "");
    }
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === "edit";
  const protectedOrg = initial?.is_protected === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-[#5b5bf6]" /> : <Building2 className="w-5 h-5 text-[#5b5bf6]" />}
            <h2 className="text-lg font-semibold">{isEdit ? "Editar organización" : "Crear organización"}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Slug</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto si queda vacío"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Plan</label>
            <NoovaSelect value={plan} onChange={setPlan} options={PLAN_OPTIONS} allowEmpty={false} />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Email del propietario</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
              />
            </div>
          )}
          {isEdit && !protectedOrg && (
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
          {protectedOrg && (
            <p className="text-xs text-amber-400/90">Organización del superadministrador — no se puede suspender ni eliminar.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={!name.trim() || (!isEdit && !ownerEmail.trim()) || saving}
            onClick={() =>
              onSubmit({ name: name.trim(), slug: slug.trim(), plan, status, owner_email: ownerEmail.trim() })
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
