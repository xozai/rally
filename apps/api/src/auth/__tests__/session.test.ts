/**
 * Test suite: apps/api/src/auth/session.ts
 *
 * COVERED:
 *  - createSessionToken: returns a signed JWT string (3 dot-delimited parts)
 *  - createSessionToken: payload contains userId (as `sub`) and email
 *  - createSessionToken: token expires after 30d (exp claim present)
 *  - createMagicLinkToken: payload contains email and purpose = "magic_link"
 *  - createMagicLinkToken: token expires after 15m (much shorter than session)
 *  - verifyMagicLinkToken: returns the correct email for a valid magic link token
 *  - verifyMagicLinkToken: throws for a valid session token (wrong purpose)
 *  - verifyMagicLinkToken: throws for an expired token
 *  - verifyMagicLinkToken: throws for a token signed with a different secret
 *  - getSession: returns { userId, email } for a request with a valid cookie
 *  - getSession: returns null when the cookie is absent
 *  - getSession: returns null for an expired session token
 *  - getSession: returns null for a token with an invalid signature
 *  - setSessionCookie: calls reply.setCookie with name "rally_session"
 *  - setSessionCookie: cookie flags include httpOnly: true and sameSite: "lax"
 *  - clearSessionCookie: calls reply.clearCookie with "rally_session"
 *  - Cookie name constant is "rally_session"
 *
 * NOT IN SCOPE:
 *  - Fastify HTTP integration (cookie plugin behaviour)
 *  - Production `secure: true` flag (depends on NODE_ENV=production)
 *  - COOKIE_DOMAIN option (optional env var)
 *  - Database-backed session storage (there is none — JWT is self-contained)
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { decodeJwt, jwtVerify, SignJWT } from "jose";

// ---------------------------------------------------------------------------
// Set up env before module load
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = "a-test-jwt-secret-that-is-at-least-32-chars";

beforeAll(() => {
  process.env["JWT_SECRET"] = TEST_JWT_SECRET;
  process.env["DATABASE_URL"] = "postgresql://test:***@localhost:5432/test";
  process.env["TOKEN_ENCRYPTION_KEY"] = "test-encryption-key-that-is-32ch";
});

async function getSession() {
  const mod = await import("../../auth/session.js");
  return mod;
}

// ---------------------------------------------------------------------------
// createSessionToken
// ---------------------------------------------------------------------------

describe("createSessionToken", () => {
  it("returns a JWT string with 3 parts", async () => {
    const { createSessionToken } = await getSession();
    const token = await createSessionToken({ userId: "u_1", email: "alice@example.com" });
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes userId as sub and email in payload", async () => {
    const { createSessionToken } = await getSession();
    const token = await createSessionToken({ userId: "u_42", email: "bob@example.com" });
    const payload = decodeJwt(token);
    expect(payload.sub).toBe("u_42");
    expect(payload["email"]).toBe("bob@example.com");
  });

  it("includes an exp claim (expires)", async () => {
    const { createSessionToken } = await getSession();
    const token = await createSessionToken({ userId: "u_1", email: "x@example.com" });
    const payload = decodeJwt(token);
    expect(payload.exp).toBeDefined();
  });

  it("session token expiry is roughly 30 days from now", async () => {
    const { createSessionToken } = await getSession();
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken({ userId: "u_1", email: "x@example.com" });
    const payload = decodeJwt(token);
    const thirtyDaysSeconds = 30 * 24 * 60 * 60;
    // Allow ±60 seconds slack
    expect(payload.exp).toBeGreaterThanOrEqual(before + thirtyDaysSeconds - 60);
    expect(payload.exp).toBeLessThanOrEqual(before + thirtyDaysSeconds + 60);
  });

  it("can be verified with the same secret", async () => {
    const { createSessionToken } = await getSession();
    const token = await createSessionToken({ userId: "u_1", email: "alice@example.com" });
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    await expect(jwtVerify(token, secret)).resolves.toBeDefined();
  });

  it("fails verification with a different secret", async () => {
    const { createSessionToken } = await getSession();
    const token = await createSessionToken({ userId: "u_1", email: "alice@example.com" });
    const wrongSecret = new TextEncoder().encode("wrong-secret-that-is-at-least-32-chars-long");
    await expect(jwtVerify(token, wrongSecret)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createMagicLinkToken + verifyMagicLinkToken
// ---------------------------------------------------------------------------

describe("createMagicLinkToken", () => {
  it("payload contains email and purpose=magic_link", async () => {
    const { createMagicLinkToken } = await getSession();
    const token = await createMagicLinkToken("magic@example.com");
    const payload = decodeJwt(token);
    expect(payload["email"]).toBe("magic@example.com");
    expect(payload["purpose"]).toBe("magic_link");
  });

  it("expiry is much shorter than a session token (15 min ≈ 900 s)", async () => {
    const { createMagicLinkToken } = await getSession();
    const before = Math.floor(Date.now() / 1000);
    const token = await createMagicLinkToken("ml@example.com");
    const payload = decodeJwt(token);
    const fifteenMin = 15 * 60;
    expect(payload.exp).toBeGreaterThanOrEqual(before + fifteenMin - 10);
    expect(payload.exp).toBeLessThanOrEqual(before + fifteenMin + 10);
  });
});

describe("verifyMagicLinkToken", () => {
  it("returns email for a valid magic link token", async () => {
    const { createMagicLinkToken, verifyMagicLinkToken } = await getSession();
    const token = await createMagicLinkToken("valid@example.com");
    const email = await verifyMagicLinkToken(token);
    expect(email).toBe("valid@example.com");
  });

  it("throws when given a session token (wrong purpose)", async () => {
    const { createSessionToken, verifyMagicLinkToken } = await getSession();
    const token = await createSessionToken({ userId: "u_1", email: "session@example.com" });
    await expect(verifyMagicLinkToken(token)).rejects.toThrow();
  });

  it("throws for a token signed with a different secret", async () => {
    const { verifyMagicLinkToken } = await getSession();
    const differentSecret = new TextEncoder().encode("other-secret-value-at-least-32-chars!");
    const foreignToken = await new SignJWT({ email: "hack@example.com", purpose: "magic_link" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(differentSecret);
    await expect(verifyMagicLinkToken(foreignToken)).rejects.toThrow();
  });

  it("throws for an already-expired token", async () => {
    const { verifyMagicLinkToken } = await getSession();
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const expiredToken = await new SignJWT({ email: "exp@example.com", purpose: "magic_link" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(secret);
    await expect(verifyMagicLinkToken(expiredToken)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  function mockRequest(cookieValue?: string): { cookies: Record<string, string | undefined> } {
    return { cookies: { rally_session: cookieValue } };
  }

  it("returns SessionClaims for a valid session cookie", async () => {
    const { createSessionToken, getSession } = await import("../../auth/session.js");
    const token = await createSessionToken({ userId: "u_99", email: "get@example.com" });
    const req = mockRequest(token) as Parameters<typeof getSession>[0];
    const result = await getSession(req);
    expect(result).toEqual({ userId: "u_99", email: "get@example.com" });
  });

  it("returns null when rally_session cookie is absent", async () => {
    const { getSession } = await import("../../auth/session.js");
    const req = mockRequest(undefined) as Parameters<typeof getSession>[0];
    expect(await getSession(req)).toBeNull();
  });

  it("returns null for an expired session token", async () => {
    const { getSession } = await import("../../auth/session.js");
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const expiredToken = await new SignJWT({ email: "x@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u_old")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(secret);
    const req = mockRequest(expiredToken) as Parameters<typeof getSession>[0];
    expect(await getSession(req)).toBeNull();
  });

  it("returns null for a token with an invalid signature", async () => {
    const { createSessionToken, getSession } = await import("../../auth/session.js");
    const token = await createSessionToken({ userId: "u_1", email: "alice@example.com" });
    // Corrupt the signature segment
    const parts = token.split(".");
    parts[2] = "invalidsignature";
    const tampered = parts.join(".");
    const req = mockRequest(tampered) as Parameters<typeof getSession>[0];
    expect(await getSession(req)).toBeNull();
  });

  it("returns null when payload is missing sub", async () => {
    const { getSession } = await import("../../auth/session.js");
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const noSubToken = await new SignJWT({ email: "nosub@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    const req = mockRequest(noSubToken) as Parameters<typeof getSession>[0];
    expect(await getSession(req)).toBeNull();
  });

  it("returns null when payload email is not a string", async () => {
    const { getSession } = await import("../../auth/session.js");
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const badEmailToken = await new SignJWT({ email: 12345 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u_1")
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    const req = mockRequest(badEmailToken) as Parameters<typeof getSession>[0];
    expect(await getSession(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setSessionCookie
// ---------------------------------------------------------------------------

describe("setSessionCookie", () => {
  it("calls reply.setCookie with cookie name 'rally_session'", async () => {
    const { setSessionCookie } = await getSession();
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as Parameters<typeof setSessionCookie>[0];
    await setSessionCookie(reply, { userId: "u_1", email: "cookie@example.com" });
    expect(setCookie).toHaveBeenCalledOnce();
    const [name] = setCookie.mock.calls[0] as [string, string, object];
    expect(name).toBe("rally_session");
  });

  it("cookie value is a valid JWT string", async () => {
    const { setSessionCookie } = await getSession();
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as Parameters<typeof setSessionCookie>[0];
    await setSessionCookie(reply, { userId: "u_1", email: "cookie@example.com" });
    const [, token] = setCookie.mock.calls[0] as [string, string, object];
    expect(token.split(".")).toHaveLength(3);
  });

  it("cookie options include httpOnly: true", async () => {
    const { setSessionCookie } = await getSession();
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as Parameters<typeof setSessionCookie>[0];
    await setSessionCookie(reply, { userId: "u_1", email: "cookie@example.com" });
    const [, , options] = setCookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(options["httpOnly"]).toBe(true);
  });

  it("cookie options include sameSite: 'lax'", async () => {
    const { setSessionCookie } = await getSession();
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as Parameters<typeof setSessionCookie>[0];
    await setSessionCookie(reply, { userId: "u_1", email: "cookie@example.com" });
    const [, , options] = setCookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(options["sameSite"]).toBe("lax");
  });

  it("cookie options include path: '/'", async () => {
    const { setSessionCookie } = await getSession();
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as Parameters<typeof setSessionCookie>[0];
    await setSessionCookie(reply, { userId: "u_1", email: "cookie@example.com" });
    const [, , options] = setCookie.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(options["path"]).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// clearSessionCookie
// ---------------------------------------------------------------------------

describe("clearSessionCookie", () => {
  it("calls reply.clearCookie with 'rally_session'", async () => {
    const { clearSessionCookie } = await getSession();
    const clearCookie = vi.fn();
    const reply = { clearCookie } as unknown as Parameters<typeof clearSessionCookie>[0];
    clearSessionCookie(reply);
    expect(clearCookie).toHaveBeenCalledOnce();
    const [name] = clearCookie.mock.calls[0] as [string, object];
    expect(name).toBe("rally_session");
  });

  it("clears with path: '/'", async () => {
    const { clearSessionCookie } = await getSession();
    const clearCookie = vi.fn();
    const reply = { clearCookie } as unknown as Parameters<typeof clearSessionCookie>[0];
    clearSessionCookie(reply);
    const [, options] = clearCookie.mock.calls[0] as [string, Record<string, unknown>];
    expect(options["path"]).toBe("/");
  });
});
