"use client";

import { authFetch } from "@/lib/telephony-api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export type SubscribeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unsupported" | "no_vapid_key" | "permission_denied" | "subscribe_failed" | "server_rejected";
      detail?: string;
    };

/** Pide permiso y suscribe este dispositivo. Nunca lanza — el motivo del fallo viene en el resultado. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.error("[push] falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en este build");
    return { ok: false, reason: "no_vapid_key" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission_denied" };

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
      });
    }

    const json = subscription.toJSON();
    const res = await authFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error("[push] el servidor rechazó la suscripción:", res.status, body);
      return { ok: false, reason: "server_rejected", detail: body?.error };
    }

    return { ok: true };
  } catch (err) {
    console.error("[push] subscribe falló:", err);
    return {
      ok: false,
      reason: "subscribe_failed",
      detail: err instanceof Error ? err.message : String(err)
    };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await authFetch("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint })
  }).catch(() => {});
}
