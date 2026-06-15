/**
 * Test suite: apps/api/src/lib/crypto.ts — encryptJson / decryptJson
 *
 * COVERED:
 *  - AES-256-GCM round-trip: encrypt then decrypt returns original value
 *  - Round-trip with various value types: string, number, object, array, null
 *  - Empty string value round-trips correctly
 *  - IV uniqueness: two encryptions of the same plaintext produce different IVs
 *  - Ciphertext uniqueness: same plaintext encrypted twice → different data blobs
 *  - Tamper detection — flipping a byte in data throws (GCM auth tag fails)
 *  - Tamper detection — mutating authTag throws
 *  - Tamper detection — mutating iv throws
 *  - Decryption with wrong key throws (simulated by altering the encrypted payload)
 *
 * NOT IN SCOPE:
 *  - Key derivation internals (SHA-256 of TOKEN_ENCRYPTION_KEY) — treated as black-box
 *  - Prisma / HTTP layer — pure crypto utility
 *  - Performance / throughput benchmarks
 */

import { beforeAll, describe, expect, it } from "vitest";

// Provide the required env vars before importing the module under test
beforeAll(() => {
  process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test";
  process.env["JWT_SECRET"] = "test-jwt-secret-that-is-at-least-32-chars-long";
  process.env["TOKEN_ENCRYPTION_KEY"] = "test-encryption-key-that-is-32ch";
});

// Dynamic import so env is set before module initialization
async function getCrypto() {
  const mod = await import("../crypto.js");
  return mod;
}

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("encryptJson / decryptJson round-trip", () => {
  it("round-trips a plain string value", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson("hello, world");
    expect(decryptJson<string>(payload)).toBe("hello, world");
  });

  it("round-trips an empty string", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson("");
    expect(decryptJson<string>(payload)).toBe("");
  });

  it("round-trips a number", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson(42);
    expect(decryptJson<number>(payload)).toBe(42);
  });

  it("round-trips null", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson(null);
    expect(decryptJson<null>(payload)).toBeNull();
  });

  it("round-trips a complex object with nested fields", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const value = { userId: "u_abc", email: "alice@example.com", roles: ["admin", "user"] };
    const payload = encryptJson(value);
    expect(decryptJson<typeof value>(payload)).toEqual(value);
  });

  it("round-trips an array", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const value = [1, "two", { three: 3 }];
    const payload = encryptJson(value);
    expect(decryptJson<typeof value>(payload)).toEqual(value);
  });
});

// ---------------------------------------------------------------------------
// IV and ciphertext uniqueness
// ---------------------------------------------------------------------------

describe("IV uniqueness", () => {
  it("produces a different IV on every call", async () => {
    const { encryptJson } = await getCrypto();
    const p1 = encryptJson("same-value");
    const p2 = encryptJson("same-value");
    expect(p1.iv).not.toBe(p2.iv);
  });

  it("produces different ciphertext blobs for the same plaintext", async () => {
    const { encryptJson } = await getCrypto();
    const p1 = encryptJson({ key: "value" });
    const p2 = encryptJson({ key: "value" });
    expect(p1.data).not.toBe(p2.data);
  });

  it("returns base64-encoded iv, authTag, and data strings", async () => {
    const { encryptJson } = await getCrypto();
    const payload = encryptJson("test");
    const base64Re = /^[A-Za-z0-9+/]+=*$/;
    expect(payload.iv).toMatch(base64Re);
    expect(payload.authTag).toMatch(base64Re);
    expect(payload.data).toMatch(base64Re);
  });
});

// ---------------------------------------------------------------------------
// Tamper detection
// ---------------------------------------------------------------------------

describe("tamper detection", () => {
  it("throws when a byte in `data` is flipped", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson({ secret: "value" });

    // Decode, flip first byte, re-encode
    const raw = Buffer.from(payload.data, "base64");
    raw[0] = raw[0]! ^ 0xff;
    const tampered = { ...payload, data: raw.toString("base64") };

    expect(() => decryptJson(tampered)).toThrow();
  });

  it("throws when authTag is corrupted", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson("integrity check");

    const raw = Buffer.from(payload.authTag, "base64");
    raw[0] = raw[0]! ^ 0x01;
    const tampered = { ...payload, authTag: raw.toString("base64") };

    expect(() => decryptJson(tampered)).toThrow();
  });

  it("throws when iv is corrupted", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const payload = encryptJson("iv tamper test");

    const raw = Buffer.from(payload.iv, "base64");
    raw[0] = raw[0]! ^ 0x01;
    const tampered = { ...payload, iv: raw.toString("base64") };

    expect(() => decryptJson(tampered)).toThrow();
  });

  it("throws when decrypting with a payload from a different key (simulate by swapping authTag)", async () => {
    const { encryptJson, decryptJson } = await getCrypto();
    const p1 = encryptJson("payload-one");
    const p2 = encryptJson("payload-two");

    // Cross-contaminate authTag from p2 into p1's payload
    const tampered = { iv: p1.iv, authTag: p2.authTag, data: p1.data };
    expect(() => decryptJson(tampered)).toThrow();
  });
});
