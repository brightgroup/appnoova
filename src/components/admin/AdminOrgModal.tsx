"use client";

import { useEffect, useState } from "react";
import { X, Building2, Pencil, Copy, Check } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { getAgencyAccessLoginUrl } from "@/lib/agency-access-url";
import { formatOrgPlanLabel, type OrgPlanOption } from "@/lib/org-plans";
import { authFetch } from "@/lib/telephony-api";
import type { AccountStatus } from "@/types/rbac";

export type OwnerMode = "new" | "existing";

export interface AdminOrgFormValues {
  name: string;
  slug: string;
  plan: string;
  status: AccountStatus;
  owner_mode: OwnerMode;
  owner_email: string;
  owner_full_name: string;
  owner_password: string;
  /** Dashboard sin logo Noova (solo título «Dashboard»). */
  hide_noova_logo: boolean;
}

interface AdminOrgModalProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: Partial<AdminOrgFormValues> & { is_protected?: boolean };
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: AdminOrgFormValues) => void;
}

const FALLBACK_PLAN_OPTIONS = [
  { value: "explorador", label: "Explorador · Prueba 14 días · 1 usuario · 15.000 cr" },
  { value: "basico", label: "Básico · $50/mes · 1 usuario · 166.667 cr · solo admin" },
  { value: "esencial", label: "Esencial · $82/mes · 5 usuarios · 350.000 cr" },
  { value: "crecimiento", label: "Crecimiento · $345/mes · 15 usuarios · 1.500.000 cr" },
  { value: "escala", label: "Escala · $815/mes · usuarios ilimitados · 3.800.000 cr" },
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
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("new");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [hideNoovaLogo, setHideNoovaLogo] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [planOptions, setPlanOptions] = useState<{ value: string; label: string }[]>(FALLBACK_PLAN_OPTIONS);

  const agencyAccessUrl = getAgencyAccessLoginUrl();

  useEffect(() => {
    if (!open) return;
    authFetch("/api/admin/pricing/plans")
      .then(res => res.json())
      .then(json => {
        const plans = (json.plans ?? []) as OrgPlanOption[];
        if (!plans.length) return;
        const options = plans.map(p => ({ value: p.id, label: formatOrgPlanLabel(p) }));
        const selected = initial?.plan;
        if (selected && !options.some(o => o.value === selected)) {
          options.unshift({ value: selected, label: `${selected} (plan actual)` });
        }
        setPlanOptions(options);
      })
      .catch(() => setPlanOptions(FALLBACK_PLAN_OPTIONS));
  }, [open, initial?.plan]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setSlug(initial?.slug ?? "");
      setPlan(initial?.plan ?? "explorador");
      setStatus((initial?.status as AccountStatus) ?? "active");
      setOwnerMode(initial?.owner_mode ?? "new");
      setOwnerEmail(initial?.owner_email ?? "");
      setOwnerFullName(initial?.owner_full_name ?? "");
      setOwnerPassword("");
      setHideNoovaLogo(initial?.hide_noova_logo === true);
      setCopiedLink(false);
    }
  }, [open, initial]);

  async function copyAgencyLink() {
    try {
      await navigator.clipboard.writeText(agencyAccessUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  const isEdit = mode === "edit";
  const protectedOrg = initial?.is_protected === true;
  const canSubmit =
    name.trim() &&
    (isEdit || (ownerMode === "existing" ? ownerEmail.trim() : ownerEmail.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08] sticky top-0 bg-[#12131a] z-10">
          <div className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-[#5b5bf6]" /> : <Building2 className="w-5 h-5 text-[#5b5bf6]" />}
            <h2 className="text-lg font-semibold">{isEdit ? "Editar organización" : "Crear organización"}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!isEdit && (
            <p className="text-xs text-gray-500 leading-relaxed">
              Crea la empresa y su propietario en un solo paso. Los demás usuarios se agregan después en Usuarios, vinculados a esta organización.
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Nombre de la organización</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Milhojaldres"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="auto si queda vacío"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Plan</label>
            <NoovaSelect value={plan} onChange={setPlan} options={planOptions} allowEmpty={false} />
          </div>

          {!isEdit && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOwnerMode("new")}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs border transition-colors ${
                    ownerMode === "new"
                      ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10 text-[#a5a5ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white"
                  }`}
                >
                  Propietario nuevo
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerMode("existing")}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs border transition-colors ${
                    ownerMode === "existing"
                      ? "border-[#5b5bf6]/40 bg-[#5b5bf6]/10 text-[#a5a5ff]"
                      : "border-white/[.08] text-gray-400 hover:text-white"
                  }`}
                >
                  Usuario existente
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Email del propietario</label>
                <input
                  type="email"
                  value={ownerEmail}
                  onChange={e => setOwnerEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
                />
              </div>

              {ownerMode === "new" && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Nombre del propietario</label>
                    <input
                      value={ownerFullName}
                      onChange={e => setOwnerFullName(e.target.value)}
                      placeholder="Ej. Juan García"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Contraseña (opcional)</label>
                    <input
                      type="text"
                      value={ownerPassword}
                      onChange={e => setOwnerPassword(e.target.value)}
                      placeholder="Se genera automáticamente si queda vacío"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600"
                    />
                  </div>
                </>
              )}

              {ownerMode === "existing" && (
                <p className="text-xs text-gray-600">
                  El usuario debe existir previamente en la plataforma. Si no, usa «Propietario nuevo».
                </p>
              )}
            </>
          )}

          {isEdit && !protectedOrg && (
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
          {protectedOrg && (
            <p className="text-xs text-amber-400/90">Organización del superadministrador — no se puede suspender ni eliminar.</p>
          )}

          <div className="rounded-xl border border-white/[.08] bg-[#0d0e14]/80 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hideNoovaLogo}
                onChange={e => setHideNoovaLogo(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-[#12131a] text-[#5b5bf6] focus:ring-[#5b5bf6]/40"
              />
              <span>
                <span className="block text-sm font-medium text-white">Cliente agencia (sin logo Noova)</span>
                <span className="block text-xs text-gray-500 mt-1 leading-relaxed">
                  En el dashboard de esta organización se oculta el logo Noova y se muestra solo el título «Dashboard».
                  Comparte el link de ingreso agencia con los usuarios de esta cuenta.
                </span>
              </span>
            </label>
            {hideNoovaLogo && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[.08] bg-[#12131a] px-3 py-2">
                <code className="flex-1 min-w-0 text-[11px] text-gray-400 truncate">{agencyAccessUrl}</code>
                <button
                  type="button"
                  onClick={copyAgencyLink}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-gray-300 hover:text-white hover:bg-white/[.08] transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08] sticky bottom-0 bg-[#12131a]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={!canSubmit || saving}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                slug: slug.trim(),
                plan,
                status,
                owner_mode: ownerMode,
                owner_email: ownerEmail.trim(),
                owner_full_name: ownerFullName.trim(),
                owner_password: ownerPassword.trim(),
                hide_noova_logo: hideNoovaLogo,
              })
            }
            className={btnPrimary}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear organización"}
          </button>
        </div>
      </div>
    </div>
  );
}
