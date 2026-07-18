import webpush from "web-push";
import { adminClient } from "@/lib/voice-agents-server";
import { getOrgInboxTeamUserIds } from "@/lib/push/team";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:info@bgsoluciones.com.co";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta dentro de /m a abrir al tocar la notificación, ej. "/m/chats/<id>". */
  url: string;
  tag?: string;
}

/**
 * Envía una notificación push a todo el equipo de la organización con acceso
 * al inbox. Nunca lanza — un fallo de push no debe romper el flujo de
 * mensajería que lo dispara. Limpia suscripciones caducadas (404/410).
 */
export async function notifyPushForOrg(
  organizationId: string,
  payload: PushPayload
): Promise<{ sent: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID_PUBLIC/PRIVATE_KEY no configuradas, se omite el envío");
    return { sent: 0 };
  }

  try {
    const userIds = await getOrgInboxTeamUserIds(organizationId);
    if (!userIds.length) return { sent: 0 };

    const db = adminClient();
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (!subs?.length) return { sent: 0 };

    const body = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        )
      )
    );

    const staleIds: string[] = [];
    let sent = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        sent += 1;
        return;
      }
      const err = r.reason as { statusCode?: number } | undefined;
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        staleIds.push(subs[i].id);
      } else {
        console.warn("[push] envío falló:", err?.statusCode, subs[i].endpoint.slice(0, 60));
      }
    });

    if (staleIds.length) {
      await db.from("push_subscriptions").delete().in("id", staleIds);
    }

    return { sent };
  } catch (err) {
    console.error("[push] notifyPushForOrg:", err instanceof Error ? err.message : err);
    return { sent: 0 };
  }
}
