import { supabase } from "@/lib/supabase";

export async function authFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  };
  return fetch(path, { ...init, headers: { ...headers, ...init?.headers } });
}
