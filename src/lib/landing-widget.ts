/** Slug del widget embebido en la landing de marketing (noova360.com). */
export function getLandingWidgetSlug(): string {
  return process.env.NEXT_PUBLIC_LANDING_WIDGET_SLUG?.trim() || "noova";
}

/** Vista previa en home: /widget/{slug}?preview=1 (solo el slug de la landing). */
export function isLandingWidgetPreview(slug: string, preview: string | null | undefined): boolean {
  if (preview !== "1") return false;
  return slug === getLandingWidgetSlug();
}
