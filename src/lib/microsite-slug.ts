import { MICROSITE_PATH_PREFIX, MICROSITE_ROUTE_PREFIXES } from "@/lib/microsite-path";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyBrandName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function isValidMicrositeSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 50 && SLUG_RE.test(slug);
}

/** Nombre legible a partir del slug del link permanente (ej. arcary-seguros → Arcary Seguros). */
export function slugToDisplayName(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return "";
  return trimmed
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function brandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function appOrigin(): string {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NOOVA_APP_URL ||
    "https://app.noova360.com"
  );
}

export function getMicrositePublicBaseUrl(): string {
  const pathPrefix = MICROSITE_PATH_PREFIX;
  const configured =
    process.env.NEXT_PUBLIC_LINK_BASE_URL ||
    process.env.NEXT_PUBLIC_MICROSITE_BASE_URL;

  if (configured) {
    const base = stripTrailingSlash(configured);
    if (base.endsWith(pathPrefix)) return base;
    if (!MICROSITE_ROUTE_PREFIXES.some(prefix => base.endsWith(prefix))) {
      return `${base}${pathPrefix}`;
    }
    return base;
  }

  return `${appOrigin()}${pathPrefix}`;
}

export function buildMicrositePublicUrl(slug: string): string {
  return `${getMicrositePublicBaseUrl()}/${slug}`;
}

export function getWidgetAppOrigin(): string {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NOOVA_APP_URL ||
    "https://app.noova360.com"
  );
}

export function buildWidgetPageUrl(slug: string): string {
  return `${getWidgetAppOrigin()}/widget/${slug}`;
}

export function buildWidgetEmbedScriptUrl(): string {
  return `${getWidgetAppOrigin()}/noova-widget.js`;
}

export function buildWidgetEmbedSnippet(slug: string, accentColor?: string): string {
  const base = getWidgetAppOrigin();
  const scriptUrl = buildWidgetEmbedScriptUrl();
  const colorAttr = accentColor?.trim()
    ? `\n  data-color="${accentColor.trim()}"`
    : "";
  return `<script
  src="${scriptUrl}"
  data-slug="${slug}"
  data-base="${base}"${colorAttr}
  async
></script>`;
}
