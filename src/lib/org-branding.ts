/** Branding del dashboard por organización (superadmin). */

export interface OrgBranding {
  hide_noova_logo: boolean;
}

export const DEFAULT_ORG_BRANDING: OrgBranding = {
  hide_noova_logo: false,
};

export function parseOrgBranding(settings: unknown): OrgBranding {
  if (!settings || typeof settings !== "object") return { ...DEFAULT_ORG_BRANDING };
  const branding = (settings as Record<string, unknown>).branding;
  if (!branding || typeof branding !== "object") return { ...DEFAULT_ORG_BRANDING };
  return {
    hide_noova_logo: (branding as Record<string, unknown>).hide_noova_logo === true,
  };
}

export function mergeOrgBrandingSettings(
  current: unknown,
  branding: Partial<OrgBranding>
): Record<string, unknown> {
  const base =
    current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  const prev = parseOrgBranding(base);
  return {
    ...base,
    branding: {
      ...prev,
      ...branding,
    },
  };
}
