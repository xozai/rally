import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

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
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

export async function verifyMagicLinkToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== "magic_link" || typeof payload.email !== "string") {
    throw new Error("Invalid magic link token");
  }
  return payload.email;
}

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
    domain: env.COOKIE_DOMAIN
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookie, { path: "/", domain: env.COOKIE_DOMAIN });
}
