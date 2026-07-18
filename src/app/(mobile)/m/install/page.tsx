"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InstallIcon } from "../icons";

const INSTALL_SEEN_KEY = "noova-m-install-seen";

type OS = "ios" | "android";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectOS(): OS {
  if (typeof navigator === "undefined") return "android";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "android";
}

export default function MobileInstallPage() {
  const router = useRouter();
  const defaultOS = useMemo(detectOS, []);
  const [os, setOs] = useState<OS>(defaultOS);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function finish() {
    try {
      localStorage.setItem(INSTALL_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    router.replace("/m/chats");
  }

  async function handleInstallClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    finish();
  }

  return (
    <div className="nv-m-onboarding" style={{ flex: 1 }}>
      <div className="install-body">
        <div className="install-icon">
          <InstallIcon width={24} height={24} />
        </div>
        <h1>Instala la app</h1>
        <p>Ábrela como cualquier otra app de tu celular, sin pasar por el navegador cada vez.</p>

        <div className="segmented">
          <button type="button" className={os === "ios" ? "active" : ""} onClick={() => setOs("ios")}>
            iPhone
          </button>
          <button type="button" className={os === "android" ? "active" : ""} onClick={() => setOs("android")}>
            Android
          </button>
        </div>

        {os === "ios" ? (
          <div className="os-steps active">
            <div className="step">
              <span className="step-num">1</span>
              <p>
                Abre este enlace en <b>Safari</b>.
              </p>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <p>
                Toca el ícono de <b>compartir</b> (el cuadrado con la flecha hacia arriba).
              </p>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <p>
                Elige <b>«Añadir a pantalla de inicio»</b>.
              </p>
            </div>
            <div className="step">
              <span className="step-num">4</span>
              <p>
                Confirma tocando <b>«Añadir»</b>.
              </p>
            </div>
          </div>
        ) : (
          <div className="os-steps active">
            {deferredPrompt ? (
              <div className="step">
                <span className="step-num">✓</span>
                <p>
                  Tu navegador ya puede instalarla — toca <b>«Instalar»</b> abajo.
                </p>
              </div>
            ) : (
              <>
                <div className="step">
                  <span className="step-num">1</span>
                  <p>
                    Abre este enlace en <b>Chrome</b>.
                  </p>
                </div>
                <div className="step">
                  <span className="step-num">2</span>
                  <p>
                    Toca el menú de <b>tres puntos</b> arriba a la derecha.
                  </p>
                </div>
                <div className="step">
                  <span className="step-num">3</span>
                  <p>
                    Elige <b>«Instalar aplicación»</b>.
                  </p>
                </div>
                <div className="step">
                  <span className="step-num">4</span>
                  <p>
                    Confirma tocando <b>«Instalar»</b>.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="install-actions">
          <button type="button" className="btn-primary" onClick={handleInstallClick}>
            {deferredPrompt ? "Instalar" : "Entrar a la app"}
          </button>
          <button type="button" className="link-muted" onClick={finish}>
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
