"use client";

/** Badges de estado con borde — mismo estilo que Organizaciones. */
export const ADMIN_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  trialing:  { label: "En prueba",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  active:    { label: "Activa",         color: "bg-green-500/20 text-green-400 border-green-500/30" },
  past_due:  { label: "Pago pendiente", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  suspended: { label: "Suspendida",     color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  canceled:  { label: "Cancelada",      color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  disabled:  { label: "Desactivada",    color: "bg-red-500/20 text-red-400 border-red-500/30" },
  invited:   { label: "Invitada",       color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

export const ADMIN_ACCOUNT_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active:    { label: "Activo",       color: "bg-green-500/20 text-green-400 border-green-500/30" },
  suspended: { label: "Suspendido",   color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  disabled:  { label: "Desactivado",  color: "bg-red-500/20 text-red-400 border-red-500/30" },
  invited:   { label: "Invitado",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

export const ADMIN_INVOICE_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  paid:    { label: "Pagada",    color: "bg-green-500/20 text-green-400 border-green-500/30" },
  overdue: { label: "Vencida",   color: "bg-red-500/20 text-red-400 border-red-500/30" },
  void:    { label: "Anulada",   color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

type AdminStatusVariant = "org" | "account" | "invoice";

const STATUS_MAPS: Record<AdminStatusVariant, Record<string, { label: string; color: string }>> = {
  org: ADMIN_STATUS_BADGE,
  account: ADMIN_ACCOUNT_STATUS_BADGE,
  invoice: ADMIN_INVOICE_STATUS_BADGE,
};

export function AdminStatusBadge({
  status,
  variant = "org",
}: {
  status: string | null | undefined;
  variant?: AdminStatusVariant;
}) {
  const map = STATUS_MAPS[variant];
  const key = status ?? "";
  const badge = map[key] ?? {
    label: status ?? "—",
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
      {badge.label}
    </span>
  );
}
