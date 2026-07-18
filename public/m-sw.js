// Service worker mínimo del panel móvil (/m). Alcance limitado a /m vía
// registration({ scope: "/m" }) — nunca intercepta nada fuera de esa ruta.
//
// A propósito NO precachea nada en "install": dentro de una PWA instalada en
// iOS no hay forma de forzar un hard-refresh, así que si aquí se precachea el
// documento en el momento de instalar, esa versión queda pegada para siempre
// aunque el sitio se actualice después — el usuario ve una versión vieja/rota
// sin ninguna forma de arreglarlo desde la app misma. Todo el cacheo es
// reactivo (fetch handler abajo), nunca adelantado.
const CACHE = "nv-m-shell-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first para todo, con fallback a caché solo si la red falla
// (evita servir datos de chats/facturación desactualizados).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Web Push ────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "Noova360", body: "Tienes una notificación nueva.", url: "/m/chats" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    /* payload no era JSON válido, se usa el default */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/m-icon-192.png",
      badge: "/icons/m-icon-192.png",
      tag: data.tag || "noova-m",
      data: { url: data.url || "/m/chats" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/m/chats";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/m") && "focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
