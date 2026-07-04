"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useOrgPermissions } from "@/components/layout/OrgPermissionsProvider";
import { useMounted } from "@/hooks/useMounted";
import { routeRuleForPath } from "@/lib/org-permissions";
import { ORG_MODULE_LABELS, type OrgPermissionModuleKey } from "@/types/rbac";

export function DashboardRouteGuard({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const pathname = usePathname();
  const router = useRouter();
  const { loading, canAccessPath } = useOrgPermissions();

  const allowed = canAccessPath(pathname);
  const rule = routeRuleForPath(pathname);

  useEffect(() => {
    if (!mounted || loading || allowed || pathname === "/dashboard") return;
    router.replace("/dashboard");
  }, [mounted, loading, allowed, pathname, router]);

  if (!mounted || loading) return <>{children}</>;

  if (!allowed && rule) {
    const moduleLabel = ORG_MODULE_LABELS[rule.module] ?? rule.module;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Sin acceso a {moduleLabel}</h1>
          <p className="text-sm text-gray-400">
            Tu rol no incluye permiso para este módulo. Si necesitas acceso, contacta al administrador
            de tu organización o a soporte Noova.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#5b5bf6] text-white text-sm font-medium hover:bg-[#4a4ae5]"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Para ocultar acciones de escritura en páginas con permiso solo lectura. */
export function useModuleWriteAccess(
  module: OrgPermissionModuleKey,
  min: "edit" | "manage" = "edit"
) {
  const { can, loading } = useOrgPermissions();
  return { loading, canWrite: can(module, min) };
}
