/** Enlaces legales públicos. Incluye etiquetas en inglés para revisión de dominio (Paddle). */
export function PublicLegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      <a href="/terminos" className="hover:underline">
        Terms and Conditions
      </a>
      <span aria-hidden className="mx-2 opacity-50">
        ·
      </span>
      <a href="/reembolsos" className="hover:underline">
        Refund Policy
      </a>
      <span aria-hidden className="mx-2 opacity-50">
        ·
      </span>
      <a href="/privacy" className="hover:underline">
        Privacy Policy
      </a>
    </nav>
  );
}
