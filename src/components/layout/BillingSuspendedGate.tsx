"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";
import { useMounted } from "@/hooks/useMounted";

const ALLOWED_PREFIX = "/dashboard/facturacion";

/**
 * Bloquea todo el panel cuando la organización está suspendida (mora pasado
 * el periodo de gracia) o desactivada por un administrador — solo deja pasar
 * /dashboard/facturacion para que puedan ver el estado y pagar.
 */
export function BillingSuspendedGate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const { loading, orgStatus } = useOrgPermissions();

  const locked = orgStatus === "suspended" || orgStatus === "disabled";

  if (!mounted || loading || !locked || pathname.startsWith(ALLOWED_PREFIX)) {
    return <>{children}</>;
  }

  const disabled = orgStatus === "disabled";

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Lock className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-xl font-semibold text-white">
          {disabled ? "Cuenta desactivada" : "Cuenta suspendida"}
        </h1>
        <p className="text-sm text-gray-400">
          {disabled
            ? "Un administrador desactivó esta cuenta. Contacta a soporte Noova si crees que es un error."
            : "Tu cuenta está suspendida por falta de pago. Regulariza tu facturación para recuperar el acceso al panel y a tus agentes."}
        </p>
        {!disabled && (
          <Link
            href="/dashboard/facturacion"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#0f7eff] text-white text-sm font-medium hover:bg-[#4a4ae5]"
          >
            Ir a facturación
          </Link>
        )}
      </div>
    </div>
  );
}
