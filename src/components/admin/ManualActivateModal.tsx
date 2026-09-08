"use client";

import { useEffect, useState } from "react";
import { X, Wallet } from "lucide-react";
import { NoovaSelect } from "@/components/ui/NoovaSelect";
import { btnPrimary, btnGhost } from "@/lib/brand-ui";
import { formatOrgPlanLabel, type OrgPlanOption } from "@/lib/org-plans";
import { authFetch } from "@/lib/telephony-api";

interface ManualActivateModalProps {
  open: boolean;
  orgName: string;
  currentPlan?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (values: { plan_id: string; months: number; reference: string }) => void;
}

const MONTH_OPTIONS = [
  { value: "1", label: "1 mes" },
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

/** Activa/renueva manualmente un plan para orgs que pagan por transferencia u otro medio fuera de Paddle. */
export function ManualActivateModal({
  open,
  orgName,
  currentPlan,
  saving,
  onClose,
  onSubmit,
}: ManualActivateModalProps) {
  const [planId, setPlanId] = useState(currentPlan ?? "esencial");
  const [months, setMonths] = useState("1");
  const [reference, setReference] = useState("");
  const [planOptions, setPlanOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    authFetch("/api/admin/pricing/plans")
      .then((res) => res.json())
      .then((json) => {
        const plans = (json.plans ?? []) as OrgPlanOption[];
        const options = plans.map((p) => ({ value: p.id, label: formatOrgPlanLabel(p) }));
        if (currentPlan && !options.some((o) => o.value === currentPlan)) {
          options.unshift({ value: currentPlan, label: `${currentPlan} (plan actual)` });
        }
        setPlanOptions(options);
      })
      .catch(() => {});
  }, [open, currentPlan]);

  useEffect(() => {
    if (open) {
      setPlanId(currentPlan ?? "esencial");
      setMonths("1");
      setReference("");
    }
  }, [open, currentPlan]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-2xl bg-[#12131a] border border-white/[.1] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#0f7eff]" />
            <h2 className="text-lg font-semibold">Activar pago manual</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/[.08] text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Para <span className="text-white font-medium">{orgName}</span>. Salda cualquier factura local
            pendiente/vencida y abre un periodo nuevo ya marcado como pagado — úsalo cuando el cliente pague
            por transferencia, Wise u otro medio fuera de la plataforma.
          </p>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Plan</label>
            <NoovaSelect value={planId} onChange={setPlanId} options={planOptions} allowEmpty={false} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Duración</label>
            <NoovaSelect value={months} onChange={setMonths} options={MONTH_OPTIONS} allowEmpty={false} />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Referencia del pago (opcional)</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej. transferencia Bancolombia 7 sept"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0d0e14] border border-white/[.12] text-sm text-white placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[.08]">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button
            type="button"
            disabled={saving || !planId}
            onClick={() => onSubmit({ plan_id: planId, months: Number(months), reference: reference.trim() })}
            className={btnPrimary}
          >
            {saving ? "Activando…" : "Activar"}
          </button>
        </div>
      </div>
    </div>
  );
}
