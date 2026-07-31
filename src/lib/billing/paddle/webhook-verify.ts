import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma del header Paddle-Signature: "ts=<epoch>;h1=<hmac>"
 * HMAC-SHA256 sobre "<ts>:<rawBody>" con PADDLE_WEBHOOK_SECRET.
 * https://developer.paddle.com/webhooks/signature-verification
 */
export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("=") as [string, string])
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(h1, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
