"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (opts: { token: string; eventCallback?: (e: { name: string }) => void }) => void;
      Checkout: { open: (opts: { transactionId: string }) => void };
    };
  }
}

let paddleLoadPromise: Promise<void> | null = null;

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
  window.Paddle.Initialize({ token });
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensurePaddleInitialized();

      const res = await authFetch("/api/billing/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "No se pudo iniciar el checkout");
      }
      const { transaction_id } = await res.json();

      window.Paddle!.Initialize({
        token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
        eventCallback: (e) => {
          if (e.name === "checkout.completed") onCheckoutCompleted?.();
        },
      });
      window.Paddle!.Checkout.open({ transactionId: transaction_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar el pago");
    } finally {
      setLoading(false);
    }
  };

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
