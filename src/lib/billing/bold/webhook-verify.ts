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
 * Nota: la documentación de Bold indica que, para transacciones hechas con
 * llaves de pruebas, la firma se calcula con una llave vacía en vez de la
 * llave secreta configurada. Como no hay forma de saber de antemano cuál
 * aplicó, probamos ambas y aceptamos si alguna coincide.
 */
export function verifyBoldWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = boldWebhookSecret();

  if (safeEqualHex(hmacHex(rawBody, secret), signatureHeader)) return true;
  if (secret && safeEqualHex(hmacHex(rawBody, ""), signatureHeader)) return true;
  return false;
}
