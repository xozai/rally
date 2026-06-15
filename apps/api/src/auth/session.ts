import { createHmac, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";
import { redis } from "../lib/redis";

const sessionCookie = "rally_session";
const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionClaims {
  userId: string;
  email: string;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function createMagicLinkToken(email: string): Promise<string> {
  return new SignJWT({ email, purpose: "magic_link" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID()) // unique jti so we can blacklist after first use (#17)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function verifyMagicLinkToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== "magic_link" || typeof payload.email !== "string") {
    throw new Error("Invalid magic link token");
  }

  // #17 — Reject already-used magic-link tokens via Redis blacklist
  const jti = payload.jti;
  const exp = payload.exp; // seconds since epoch
  if (jti) {
    const blacklistKey = `ml:used:${jti}`;
    if (redis) {
      const alreadyUsed = await redis.get(blacklistKey);
      if (alreadyUsed) throw new Error("Magic link already used");
      // Store with TTL matching token expiry so Redis doesn't grow forever
      const ttl = exp ? Math.max(1, exp - Math.floor(Date.now() / 1000)) : 900;
      await redis.set(blacklistKey, "1", "EX", ttl);
    } else {
      // Without Redis we use a simple in-process set (best-effort in dev)
      if (usedJtis.has(jti)) throw new Error("Magic link already used");
      usedJtis.add(jti);
    }
  }

  return payload.email;
}

// In-memory fallback for environments without Redis (development)
const usedJtis = new Set<string>();

export async function getSession(request: FastifyRequest): Promise<SessionClaims | null> {
  const token = request.cookies[sessionCookie];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function setSessionCookie(reply: FastifyReply, claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims);
  reply.setCookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    domain: env.COOKIE_DOMAIN,
    maxAge: 60 * 60 * 24 * 30 // 30 days (#18)
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookie, {
    path: "/",
    domain: env.COOKIE_DOMAIN,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" // match set flags so browser clears it (#18)
  });
}

/** HMAC-SHA256 a string with the JWT_SECRET (used for signing OAuth state). */
export function hmacState(payload: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("hex");
}
