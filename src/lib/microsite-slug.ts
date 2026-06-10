import { MICROSITE_PATH_PREFIX } from "@/lib/microsite-path";

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

export function brandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function getMicrositePublicBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_LINK_BASE_URL ||
    process.env.NEXT_PUBLIC_MICROSITE_BASE_URL ||
    `https://app.noova360.com${MICROSITE_PATH_PREFIX}`;
  return base.replace(/\/$/, "");
}

export function buildMicrositePublicUrl(slug: string): string {
  return `${getMicrositePublicBaseUrl()}/${slug}`;
}
