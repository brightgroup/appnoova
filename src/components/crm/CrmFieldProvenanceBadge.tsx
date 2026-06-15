import { Sparkles, MessageCircle } from "lucide-react";
import type { CrmFieldProvenanceEntry } from "@/types/crm";
import { ORIGIN_LABELS } from "@/lib/crm-contact-provenance";

interface CrmFieldProvenanceBadgeProps {
  provenance?: CrmFieldProvenanceEntry | null;
}

export function CrmFieldProvenanceBadge({ provenance }: CrmFieldProvenanceBadgeProps) {
  if (!provenance) return null;
  if (provenance.origen === "manual") return null;

  const label = ORIGIN_LABELS[provenance.origen] ?? provenance.origen;
  const Icon = provenance.origen === "whatsapp" ? MessageCircle : Sparkles;

  if (provenance.verificado && provenance.origen === "whatsapp") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400/90 mt-0.5"
        title={`Origen: ${label} (canal verificado)`}
      >
        <Icon className="w-3 h-3" /> {label}
      </span>
    );
  }

  if (provenance.verificado) return null;

  const tone =
    provenance.origen === "whatsapp"
      ? "text-emerald-400/90"
      : "text-amber-400/90";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${tone} mt-0.5`}
      title={`Origen: ${label}${provenance.confianza ? ` · confianza ${provenance.confianza}` : ""}`}
    >
      <Icon className="w-3 h-3" /> {label} · pendiente verificar
    </span>
  );
}
