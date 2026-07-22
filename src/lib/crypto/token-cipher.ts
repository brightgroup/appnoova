import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Cifrado simétrico para tokens sensibles guardados en BD (refresh/access token
 * de Google Calendar). A diferencia del SID de Twilio (texto plano hoy), un
 * token OAuth de Google es más sensible y expira/rota, así que se cifra a
 * nivel de aplicación con AES-256-GCM.
 *
 * Formato guardado: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
 */

function getKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENC_KEY?.trim();
  if (!raw) {
    throw new Error(
      "Falta CALENDAR_TOKEN_ENC_KEY en .env.local (clave de cifrado para tokens de conectores)."
    );
  }
  // Acepta la clave en cualquier longitud/formato legible y la deriva a 32 bytes (AES-256).
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM recomienda IV de 12 bytes
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Payload cifrado con formato inválido");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}
