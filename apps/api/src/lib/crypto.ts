import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../env";

const algorithm = "aes-256-gcm";

function key(): Buffer {
  return createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();
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
