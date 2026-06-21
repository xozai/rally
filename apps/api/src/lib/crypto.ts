import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

const algorithm = "aes-256-gcm";

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", env.TOKEN_ENCRYPTION_KEY, "rally-token-encryption", "", 32));
}

export function encryptJson(value: unknown): { iv: string; authTag: string; data: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptJson<T>(payload: { iv: string; authTag: string; data: string }): T {
  const decipher = createDecipheriv(algorithm, key(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

/**
 * Generate a stateless HMAC-SHA256 download token for a confirmed event's ICS file.
 * The token is HMAC-SHA256(eventId, TOKEN_ENCRYPTION_KEY) encoded as base64url.
 */
export function generateIcsToken(eventId: string): string {
  return createHmac("sha256", env.TOKEN_ENCRYPTION_KEY).update(eventId).digest("base64url");
}

/**
 * Verify an ICS download token using a constant-time comparison to prevent
 * timing-based attacks.
 */
export function verifyIcsToken(eventId: string, token: string): boolean {
  const expected = generateIcsToken(eventId);
  // Lengths must match before timingSafeEqual (it throws on mismatched lengths)
  if (Buffer.byteLength(expected) !== Buffer.byteLength(token)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
