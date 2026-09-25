/**
 * Pasarelas de pago habilitadas para cobros NUEVOS.
 *
 * Por ahora solo Bold (COP, Colombia): Paddle queda apagado para iniciar
 * checkouts (planes, créditos). Las suscripciones Paddle que ya existen
 * siguen funcionando — su webhook, renovación, portal de tarjeta y
 * cancelación no dependen de este flag, para no dejar a esos clientes sin
 * forma de gestionar lo que ya se les cobra.
 */
export const PADDLE_CHECKOUT_ENABLED = false;
