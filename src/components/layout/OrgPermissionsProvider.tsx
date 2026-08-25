"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authFetch } from "@/lib/telephony-api";
import {
  buildPermissionFlags,
  canAccessDashboardPath,
  canAccessModule,
  emptyOrgPermissions,
  type OrgPermissionsMap,
} from "@/lib/org-permissions";
import type { OrgPermissionModuleKey, PermissionLevel } from "@/types/rbac";
import type { OrgBranding } from "@/lib/org-branding";
import { DEFAULT_ORG_BRANDING } from "@/lib/org-branding";
import type { OrgModules } from "@/lib/org-modules";
import { DEFAULT_ORG_MODULES } from "@/lib/org-modules";

interface OrgMeResponse {
  organization?: { id: string; name: string; slug: string; plan: string; status: string };
  membership?: { role_slug: string; role_name: string };
  permissions?: OrgPermissionsMap;
  branding?: OrgBranding;
  modules?: OrgModules;
}

interface OrgPermissionsContextValue {
  loading: boolean;
  permissions: OrgPermissionsMap;
  roleSlug: string;
  roleName: string;
  orgName: string;
  can: (module: OrgPermissionModuleKey, min?: PermissionLevel) => boolean;
  canAccessPath: (pathname: string) => boolean;
  flags: ReturnType<typeof buildPermissionFlags>;
  branding: OrgBranding;
  modules: OrgModules;
  refresh: () => Promise<void>;
}

const OrgPermissionsContext = createContext<OrgPermissionsContextValue | null>(null);

export function OrgPermissionsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<OrgPermissionsMap>(emptyOrgPermissions());
  const [roleSlug, setRoleSlug] = useState("");
  const [roleName, setRoleName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_ORG_BRANDING);
  const [modules, setModules] = useState<OrgModules>(DEFAULT_ORG_MODULES);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch("/api/org/me");
      const json = (await res.json()) as OrgMeResponse;
      if (!res.ok) {
        setPermissions(emptyOrgPermissions());
        setModules(DEFAULT_ORG_MODULES);
        return;
      }
      setPermissions({ ...emptyOrgPermissions(), ...(json.permissions ?? {}) });
      setRoleSlug(json.membership?.role_slug ?? "");
      setRoleName(json.membership?.role_name ?? "");
      setOrgName(json.organization?.name ?? "");
      setBranding(json.branding ?? DEFAULT_ORG_BRANDING);
      setModules(json.modules ?? DEFAULT_ORG_MODULES);
    } catch {
      setPermissions(emptyOrgPermissions());
      setModules(DEFAULT_ORG_MODULES);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<OrgPermissionsContextValue>(() => {
    const flags = buildPermissionFlags(permissions);
    return {
      loading,
      permissions,
      roleSlug,
      roleName,
      orgName,
      can: (module, min = "view") => canAccessModule(permissions, module, min),
      canAccessPath: (pathname) => canAccessDashboardPath(permissions, pathname),
      flags,
      branding,
      modules,
      refresh: load,
    };
  }, [loading, permissions, roleSlug, roleName, orgName, branding, modules, load]);

  return (
    <OrgPermissionsContext.Provider value={value}>
      {children}
    </OrgPermissionsContext.Provider>
  );
}

export function useOrgPermissions(): OrgPermissionsContextValue {
  const ctx = useContext(OrgPermissionsContext);
  if (!ctx) {
    const permissions = emptyOrgPermissions();
    return {
      loading: false,
      permissions,
      roleSlug: "",
      roleName: "",
      orgName: "",
      can: () => true,
      canAccessPath: () => true,
      flags: buildPermissionFlags(permissions),
      branding: DEFAULT_ORG_BRANDING,
      modules: DEFAULT_ORG_MODULES,
      refresh: async () => {},
    };
  }
  return ctx;
}
