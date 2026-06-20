/** Ancho mínimo para panel (sidebar + tablas ~900px + márgenes). */
export const DESKTOP_MIN_WIDTH_PX = 1200;

export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;

export function isDesktopViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}
