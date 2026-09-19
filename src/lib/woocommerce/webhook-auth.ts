import crypto from "crypto";

/**
 * Verifica el header `X-WC-Webhook-Signature` que WooCommerce manda en cada
 * webhook entrante: base64(HMAC-SHA256(cuerpo crudo, secret)) — a diferencia
 * del webhook de HubSpot ya existente en este repo (`hubspot/[token]/route.ts`),
 * que no verifica firma, aquí sí se verifica desde el día 1 (mismo mecanismo
 * que `verifyMetaWebhookSignature`, adaptado al formato base64 de WooCommerce
 * en vez de hex).
 */
export function verifyWooCommerceWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
