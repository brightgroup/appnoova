"use client";

import { useEffect } from "react";

/** Registra el SW solo con scope "/m" — no puede interceptar nada fuera de esta ruta. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/m-sw.js", { scope: "/m" }).catch(() => {
      /* instalación degradada sin SW; la app sigue funcionando por red */
    });
  }, []);

  return null;
}
