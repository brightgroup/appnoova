import { createHmac, timingSafeEqual } from "node:crypto";
import { boldWebhookSecret } from "@/lib/billing/bold/client";

function hmacHex(rawBody: string, secret: string): string {
  const encodedBody = Buffer.from(rawBody, "utf-8").toString("base64");
  return createHmac("sha256", secret).update(encodedBody).digest("hex");
}

function safeEqualHex(expectedHex: string, actualHex: string): boolean {
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const actualBuf = Buffer.from(actualHex, "hex");
  if (expectedBuf.length !== actualBuf.length || expectedBuf.length === 0) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Verifica el header `x-bold-signature`: HMAC-SHA256 hex sobre el cuerpo
 * crudo codificado en Base64, usando la llave secreta del comercio.
 * https://developers.bold.co/webhook
 *
 * Solo se acepta la firma calculada con la llave secreta configurada. Bold
 * firma las transacciones de prueba con una llave vacía, pero esa firma la
 * puede calcular cualquiera, así que no la aceptamos: esos eventos caen al
 * camino de confirmación contra la API de Bold en la ruta del webhook.
 */
export function verifyBoldWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = boldWebhookSecret();
  if (!secret) return false;
  return safeEqualHex(hmacHex(rawBody, secret), signatureHeader);
}
