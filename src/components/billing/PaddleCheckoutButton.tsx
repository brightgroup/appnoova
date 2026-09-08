"use client";

import { useCallback, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";

type PaddleCheckoutSettings = {
  displayMode?: "overlay" | "inline";
  theme?: "light" | "dark";
  locale?: string;
  variant?: "one-page" | "multi-page";
};

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (opts: {
        token: string;
        eventCallback?: (e: { name: string }) => void;
        checkout?: { settings?: PaddleCheckoutSettings };
      }) => void;
      Checkout: { open: (opts: { transactionId: string }) => void };
    };
  }
}

let paddleLoadPromise: Promise<void> | null = null;
let paddleInitialized = false;
let activeOnCompleted: (() => void) | null = null;

function loadPaddleJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Paddle) return Promise.resolve();
  if (paddleLoadPromise) return paddleLoadPromise;

  paddleLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Paddle.js"));
    document.head.appendChild(script);
  });
  return paddleLoadPromise;
}

async function ensurePaddleInitialized() {
  await loadPaddleJs();
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) throw new Error("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN no configurado");
  if (!window.Paddle) throw new Error("Paddle.js no disponible");

  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.startsWith("test_")) {
    window.Paddle.Environment.set("sandbox");
  }

  // Paddle.js rechaza una segunda llamada a Initialize, así que solo corre una vez:
  // el eventCallback despacha al callback del checkout activo en cada momento.
  if (paddleInitialized) return;
  paddleInitialized = true;
  window.Paddle.Initialize({
    token,
    eventCallback: (e) => {
      if (e.name === "checkout.completed") {
        activeOnCompleted?.();
        activeOnCompleted = null;
      }
    },
    checkout: {
      settings: {
        displayMode: "overlay",
        // Fijo en "light": el brand color configurado en Paddle es negro, y en el
        // tema oscuro del checkout se vería negro sobre negro (mismo patrón de
        // contraste del rebrand de colores). El negro sí contrasta sobre claro.
        theme: "light",
        locale: "es",
        variant: "one-page",
      },
    },
  });
}

/**
 * Abre un overlay de Paddle a partir de cualquier endpoint que devuelva
 * `{ transaction_id }` (pago de plan, compra de créditos, etc.) — reutilizable
 * fuera de PaddleCheckoutButton.
 */
export function usePaddleCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = useCallback(
    async (endpoint: string, body: Record<string, unknown>, onCompleted?: () => void) => {
      setLoading(true);
      setError(null);
      try {
        await ensurePaddleInitialized();

        const res = await authFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error || "No se pudo iniciar el pago");
        }
        const { transaction_id } = await res.json();

        activeOnCompleted = onCompleted ?? null;
        window.Paddle!.Checkout.open({ transactionId: transaction_id });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al iniciar el pago");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { openCheckout, loading, error };
}

export function PaddleCheckoutButton({
  planId,
  planName,
  onCheckoutCompleted,
}: {
  planId: string;
  planName: string;
  onCheckoutCompleted?: () => void;
}) {
  const { openCheckout, loading, error } = usePaddleCheckout();

  const handleClick = () => openCheckout("/api/billing/paddle/checkout", { plan_id: planId }, onCheckoutCompleted);

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--nv-accent)]/40 bg-[var(--nv-accent)]/10 hover:bg-[var(--nv-accent)]/20 text-[var(--nv-accent)] text-[11px] font-semibold py-2 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
        Pagar {planName} con tarjeta (USD)
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
