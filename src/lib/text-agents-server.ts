import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

/** Cliente admin de Supabase — solo infra compartida; tablas de texto y voz son independientes. */
export function textAgentsAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Verifica el JWT del request y devuelve el user id. `getClaims()` valida localmente con
 * WebCrypto contra la llave pública del proyecto (asimétrica) en vez de pegarle a la API de
 * Auth en cada request como hacía `getUser()` — ver el comentario largo en
 * `voice-agents-server.ts::getAuthUserFromRequest` (mismo patrón, mismo trade-off de
 * revocación acotado a la vida del token).
 */
export async function getTextAgentUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data) return null;
  return data.claims.sub;
}
