import { getAuthToken } from "@/lib/voice-agents-api";

export async function authFetch(path: string, init?: RequestInit) {
  const token = await getAuthToken();
  const method = (init?.method ?? "GET").toUpperCase();
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // No Content-Type en GET: proxies (Coolify/Traefik) pueden esperar un body y devolver 502.
  if (
    !isFormData &&
    init?.body &&
    method !== "GET" &&
    method !== "HEAD" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(path, { ...init, headers });
}
