/** Base del producto (APIs, login, widget). */
export function getAppApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_API_URL?.replace(/\/$/, "").trim() ||
    "https://app.noova360.com"
  );
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim() || getAppApiUrl()
  );
}

export function appApiPath(path: string): string {
  const base = getAppApiUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function appPath(path: string): string {
  const base = getAppUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
