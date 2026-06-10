/** Ruta pública corta del micrositio. Cambiable con NEXT_PUBLIC_MICROSITE_PATH (ej. /c, /l, /go) */
export const MICROSITE_PATH_PREFIX = normalizeMicrositePath(
  process.env.NEXT_PUBLIC_MICROSITE_PATH || "/c"
);

function normalizeMicrositePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/c";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/c";
}

/** Prefijos de ruta que llevan a la plantilla de micrositio (slug en el siguiente segmento) */
export const MICROSITE_ROUTE_PREFIXES = [MICROSITE_PATH_PREFIX, "/agenteclientes"] as const;

export function extractMicrositeSlugFromPath(pathname: string): string | null {
  for (const prefix of MICROSITE_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname === `${prefix}/`) continue;
    if (pathname.startsWith(`${prefix}/`)) {
      const slug = pathname.slice(prefix.length + 1).split("/").filter(Boolean)[0];
      return slug || null;
    }
  }
  return null;
}

export function micrositePublicPath(slug: string): string {
  return `${MICROSITE_PATH_PREFIX}/${slug}`;
}
