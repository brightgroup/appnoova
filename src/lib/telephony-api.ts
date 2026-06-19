import { getAuthToken } from "@/lib/voice-agents-api";

export async function authFetch(path: string, init?: RequestInit) {
  const token = await getAuthToken();
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(path, { ...init, headers: { ...headers, ...init?.headers } });
}
