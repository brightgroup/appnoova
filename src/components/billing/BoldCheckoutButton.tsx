"use client";

import { useCallback, useRef, useState } from "react";
import { Wallet2, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/telephony-api";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * A diferencia de Paddle (overlay con evento `checkout.completed`), el
 * checkout de Bold es una redirección a una página hospedada por Bold —
 * abrimos esa URL en una pestaña nueva y hacemos polling del estado del
 * `bold_payment_requests` hasta que el webhook lo marque `paid` (o hasta
 * agotar el tiempo de espera, por si el cliente cierra la pestaña sin pagar).
 */
export function useBoldCheckout() {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setPolling(false);
  }, []);

  const openCheckout = useCallback(
    async (endpoint: string, body: Record<string, unknown>, onCompleted?: () => void) => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error || "No se pudo iniciar el pago");
        }
        const { checkout_url, request_id } = await res.json();
        window.open(checkout_url, "_blank", "noopener,noreferrer");

        stopPolling();
        setPolling(true);
        const startedAt = Date.now();
        pollTimer.current = setInterval(async () => {
          if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            stopPolling();
            return;
          }
          try {
            const statusRes = await authFetch(`/api/billing/bold/status?request_id=${request_id}`);
            if (!statusRes.ok) return;
            const { status } = await statusRes.json();
            if (status === "paid") {
              stopPolling();
              onCompleted?.();
            } else if (status === "failed" || status === "expired") {
              stopPolling();
            }
          } catch {
            // Reintenta en el siguiente tick.
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al iniciar el pago");
      } finally {
        setLoading(false);
      }
    },
    [stopPolling]
  );

  return { openCheckout, loading, polling, error };
}

export function BoldCheckoutButton({
  planId,
  planName,
  onCheckoutCompleted,
}: {
  planId: string;
  planName: string;
  onCheckoutCompleted?: () => void;
}) {
  const { openCheckout, loading, polling, error } = useBoldCheckout();

  const handleClick = () => openCheckout("/api/billing/bold/checkout", { plan_id: planId }, onCheckoutCompleted);

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={loading || polling}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--nv-accent)] hover:opacity-90 text-white text-[11px] font-semibold py-2 transition-opacity disabled:opacity-50"
      >
        {loading || polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet2 className="w-3 h-3" />}
        {loading ? "Abriendo…" : polling ? "Esperando confirmación del pago…" : `Pagar ${planName}`}
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
