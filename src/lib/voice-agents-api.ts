import { supabase } from "@/lib/supabase";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms))
  ]);
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const sessionResult = await withTimeout(supabase.auth.getSession(), 8_000);
    if (!sessionResult) return null;

    const { data: { session } } = sessionResult;
    if (session?.access_token) return session.access_token;

    const refreshResult = await withTimeout(supabase.auth.refreshSession(), 8_000);
    if (!refreshResult) return null;

    return refreshResult.data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function getAuthHeadersMultipart(): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
