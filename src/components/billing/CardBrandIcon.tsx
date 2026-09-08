import { CreditCard } from "lucide-react";

/**
 * Ícono de marca de tarjeta (solo estético). Paddle solo devuelve `card.type`
 * como texto ("visa", "mastercard", ...), no un logo — no hay endpoint de
 * imagen. Este componente dibuja un badge reconocible por marca en vez del
 * texto plano "Visa"/"Mastercard".
 */
export function CardBrandIcon({ brand, className = "w-7 h-5" }: { brand: string | null; className?: string }) {
  const normalized = (brand ?? "").toLowerCase().replace(/[\s_-]/g, "");

  if (normalized === "visa") {
    return (
      <span className={`${className} rounded-[3px] bg-white border border-black/10 flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 48 32" className="w-full h-full">
          <text x="24" y="21" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="700" fontSize="14" fill="#1434CB">
            VISA
          </text>
        </svg>
      </span>
    );
  }

  if (normalized === "mastercard") {
    return (
      <span className={`${className} rounded-[3px] bg-white border border-black/10 flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 48 32" className="w-4 h-4">
          <circle cx="19" cy="16" r="10" fill="#EB001B" />
          <circle cx="29" cy="16" r="10" fill="#F79E1B" fillOpacity="0.92" />
        </svg>
      </span>
    );
  }

  if (normalized === "americanexpress" || normalized === "amex") {
    return (
      <span className={`${className} rounded-[3px] bg-[#2E77BC] flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 48 32" className="w-full h-full">
          <text x="24" y="20" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill="white">
            AMEX
          </text>
        </svg>
      </span>
    );
  }

  return (
    <span className={`${className} rounded-[3px] bg-[var(--nv-bg-control)] border border-[var(--nv-border)] flex items-center justify-center shrink-0`}>
      <CreditCard className="w-3.5 h-3.5 text-[var(--nv-text-muted)]" />
    </span>
  );
}
