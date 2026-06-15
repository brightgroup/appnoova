import { getAuthToken } from "@/lib/voice-agents-api";

export async function authFetch(path: string, init?: RequestInit) {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(path, { ...init, headers: { ...headers, ...init?.headers } });
}
