import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken } from "@/lib/crypto/token-cipher";
import { getMetaAppId, getMetaAppSecret, metaGraphBaseUrl } from "@/lib/meta/graph-config";
import type { MetaMessagingChannelRecord, MetaMessagingPlatform } from "@/lib/meta-messaging/types";

/** Campos de página que activan Messenger y, vía la misma página, Instagram Direct. */
const PAGE_SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_echoes", "messaging_referrals"];

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${metaGraphBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  const json = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Meta Graph error ${res.status}`);
  }
  return json;
}

/**
 * El SDK de JS entrega el token de usuario al navegador; antes de usarlo se
 * confirma con Meta que es válido y que fue emitido para ESTA app (si no, un
 * token de otra app con permisos de páginas podría colarse).
 */
async function assertUserTokenForThisApp(userToken: string): Promise<void> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) throw new Error("META_APP_ID y META_APP_SECRET requeridos");

  const url = new URL(`${metaGraphBaseUrl()}/debug_token`);
  url.searchParams.set("input_token", userToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { app_id?: string; is_valid?: boolean; type?: string };
  } & GraphError;

  if (!res.ok || !json.data?.is_valid || json.data.app_id !== appId || json.data.type !== "USER") {
    throw new Error("La sesión de Facebook no es válida. Vuelve a conectar.");
  }
}

/** Token de usuario de larga duración (60 días); los tokens de página derivados de él no expiran. */
async function exchangeForLongLivedUserToken(shortToken: string): Promise<string> {
  const appId = getMetaAppId();
  const appSecret = getMetaAppSecret();
  if (!appId || !appSecret) throw new Error("META_APP_ID y META_APP_SECRET requeridos");

  const url = new URL(`${metaGraphBaseUrl()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string } & GraphError;
  // Si Meta ya entregó un token largo, el intercambio puede fallar: se usa el original.
  return json.access_token || shortToken;
}

export interface GrantedMetaPage {
  pageId: string;
  pageName: string;
  pageToken: string;
  igUserId: string | null;
  igUsername: string | null;
}

async function listGrantedPages(userToken: string): Promise<GrantedMetaPage[]> {
  const out: GrantedMetaPage[] = [];
  let path: string | null =
    "/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100";

  while (path) {
    const page: {
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        instagram_business_account?: { id?: string; username?: string };
      }>;
      paging?: { next?: string };
    } = await graphGet(path, userToken);

    for (const row of page.data ?? []) {
      if (!row.id || !row.access_token) continue;
      out.push({
        pageId: row.id,
        pageName: row.name?.trim() || "Página de Facebook",
        pageToken: row.access_token,
        igUserId: row.instagram_business_account?.id ?? null,
        igUsername: row.instagram_business_account?.username ?? null
      });
    }

    const next = page.paging?.next;
    path = next ? next.replace(metaGraphBaseUrl(), "") : null;
  }
  return out;
}

async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${metaGraphBaseUrl()}/${pageId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", PAGE_SUBSCRIBED_FIELDS.join(","));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${pageToken}` },
    signal: AbortSignal.timeout(15000)
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean } & GraphError;
  if (!res.ok || json.success !== true) {
    throw new Error(json.error?.message || `No se pudo suscribir la página (${res.status})`);
  }
}

/** Quita la suscripción de la app a la página (al desconectar su último canal). Nunca lanza. */
export async function unsubscribePageFromApp(pageId: string, pageToken: string): Promise<void> {
  try {
    await fetch(`${metaGraphBaseUrl()}/${pageId}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${pageToken}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    console.warn("[meta-messaging] unsubscribe:", err);
  }
}

export interface ConnectedChannelSummary {
  platform: MetaMessagingPlatform;
  channelId: string;
  label: string;
}

export interface ConnectPageIssue {
  pageName: string;
  message: string;
}

export interface ConnectMetaMessagingResult {
  connected: ConnectedChannelSummary[];
  issues: ConnectPageIssue[];
  /** Páginas sin Instagram profesional vinculado (se conectó solo Messenger). */
  pagesWithoutInstagram: string[];
}

interface UpsertInput {
  organizationId: string;
  userId: string;
  textAgentId: string;
  platform: MetaMessagingPlatform;
  page: GrantedMetaPage;
  tokenEnc: string;
}

/**
 * Crea o reactiva el canal. Una página/cuenta activa en OTRA organización no se
 * toca (el webhook no podría saber a cuál entregar); en la misma organización se
 * reutiliza la fila (reconexión: token nuevo, conserva el agente elegido antes).
 */
async function upsertChannel(
  db: SupabaseClient,
  input: UpsertInput
): Promise<{ channelId: string } | { conflict: true }> {
  const { platform, page } = input;
  const keyColumn = platform === "instagram" ? "ig_user_id" : "page_id";
  const keyValue = platform === "instagram" ? page.igUserId! : page.pageId;

  const { data: rows, error } = await db
    .from("meta_messaging_channels")
    .select("id, organization_id, status, text_agent_id")
    .eq("platform", platform)
    .eq(keyColumn, keyValue);
  if (error) throw new Error(error.message);

  const existing = (rows ?? []) as Pick<MetaMessagingChannelRecord, "id" | "organization_id" | "status" | "text_agent_id">[];
  if (existing.some(r => r.organization_id !== input.organizationId && r.status !== "disconnected")) {
    return { conflict: true };
  }

  const nowIso = new Date().toISOString();
  const fields = {
    page_id: page.pageId,
    page_name: page.pageName,
    ig_user_id: platform === "instagram" ? page.igUserId : null,
    ig_username: platform === "instagram" ? page.igUsername : null,
    page_access_token_enc: input.tokenEnc,
    status: "active" as const,
    last_error: null,
    connected_by_user_id: input.userId,
    updated_at: nowIso
  };

  const own = existing.find(r => r.organization_id === input.organizationId);
  if (own) {
    const { error: updErr } = await db
      .from("meta_messaging_channels")
      .update({ ...fields, text_agent_id: own.text_agent_id ?? input.textAgentId })
      .eq("id", own.id);
    if (updErr) throw new Error(updErr.message);
    return { channelId: own.id };
  }

  const { data: inserted, error: insErr } = await db
    .from("meta_messaging_channels")
    .insert({
      ...fields,
      organization_id: input.organizationId,
      user_id: input.userId,
      text_agent_id: input.textAgentId,
      platform
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") return { conflict: true };
    throw new Error(insErr.message);
  }
  return { channelId: String(inserted.id) };
}

/**
 * Finaliza el login de Meta: valida el token, trae las páginas que el usuario
 * autorizó en el popup, suscribe cada una a la app y registra sus canales
 * (Messenger siempre; Instagram si la página tiene cuenta profesional vinculada).
 */
export async function connectMetaMessagingFromUserToken(
  db: SupabaseClient,
  input: { organizationId: string; userId: string; textAgentId: string; userAccessToken: string }
): Promise<ConnectMetaMessagingResult> {
  await assertUserTokenForThisApp(input.userAccessToken);
  const userToken = await exchangeForLongLivedUserToken(input.userAccessToken);
  const pages = await listGrantedPages(userToken);

  if (!pages.length) {
    throw new Error("No autorizaste ninguna página de Facebook. Vuelve a conectar y selecciona al menos una.");
  }

  const result: ConnectMetaMessagingResult = { connected: [], issues: [], pagesWithoutInstagram: [] };

  for (const page of pages) {
    try {
      await subscribePageToApp(page.pageId, page.pageToken);
    } catch (err) {
      result.issues.push({
        pageName: page.pageName,
        message: err instanceof Error ? err.message : "No se pudo suscribir la página"
      });
      continue;
    }

    const tokenEnc = encryptToken(page.pageToken);
    const platforms: MetaMessagingPlatform[] = page.igUserId ? ["messenger", "instagram"] : ["messenger"];
    if (!page.igUserId) result.pagesWithoutInstagram.push(page.pageName);

    for (const platform of platforms) {
      const label = platform === "instagram" ? `@${page.igUsername ?? page.pageName}` : page.pageName;
      const upsert = await upsertChannel(db, { ...input, platform, page, tokenEnc });
      if ("conflict" in upsert) {
        result.issues.push({
          pageName: label,
          message: "Ya está conectada en otra organización de Noova. Desconéctala allá primero."
        });
        continue;
      }
      result.connected.push({ platform, channelId: upsert.channelId, label });
    }
  }

  return result;
}
