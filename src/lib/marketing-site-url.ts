/** Sitio informativo (landing) — separado del producto en app.noova360.com */
export function getMarketingSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETING_URL?.replace(/\/$/, "").trim() ||
    "https://noova360.com"
  );
}

export function marketingPath(path = "/"): string {
  const base = getMarketingSiteUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p === "/" ? "" : p}` || base;
}
