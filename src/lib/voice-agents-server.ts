import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Verifica el JWT del request y devuelve el usuario (solo los campos que el resto del código
 * usa: id/email/user_metadata). `getClaims()` valida localmente con WebCrypto contra la llave
 * pública del proyecto (asimétrica, ver Supabase → Auth → JWT Signing Keys) en vez de pegarle a
 * la API de Auth en cada request como hacía `getUser()` — mismo nivel de seguridad de firma,
 * pero sin ese round-trip. Único trade-off real: si se banea/borra a un usuario o se cierra su
 * sesión a la fuerza, un token ya emitido sigue validando localmente hasta que expira (hoy 1h),
 * en vez de cortarse al instante. Si el proyecto alguna vez vuelve a firmar con secreto simétrico,
 * `getClaims()` cae solo de vuelta a validar por red — no rompe nada.
 */
export async function getAuthUserFromRequest(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) return null;
  const { claims } = data;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    user_metadata: claims.user_metadata ?? {}
  };
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const user = await getAuthUserFromRequest(req);
  return user?.id ?? null;
}

export function userDisplayName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata ?? {};
  const name = meta.full_name || meta.name || meta.display_name;
  if (typeof name === "string" && name.trim()) return name.trim();
  if (user.email) return user.email.split("@")[0];
  return "Usuario";
}
