import crypto from "crypto";
import { getMetaAppSecret, getMetaWebhookVerifyToken } from "@/lib/meta/graph-config";

/** Valida GET hub.verify_token de Meta. */
export function verifyMetaWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null
): string | null {
  const expected = getMetaWebhookVerifyToken();
  if (!expected || mode !== "subscribe" || token !== expected || !challenge) {
    return null;
  }
  return challenge;
}

/** Valida X-Hub-Signature-256 del payload POST. */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = getMetaAppSecret();
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/** Permite desactivar firma solo en dev local. */
export function shouldSkipMetaWebhookSignature(): boolean {
  return process.env.META_WEBHOOK_SKIP_SIGNATURE === "1";
}
