import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Resend } from "resend";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { env } from "../env";
import { encryptJson } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { clearSessionCookie, createMagicLinkToken, getSession, hmacState, setSessionCookie, verifyMagicLinkToken } from "../auth/session";

const emailSchema = z.object({
  email: z.string().email()
});

const googleProfileSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

const oauthQuerySchema = z.object({
  token: z.string().optional()
});

const stateSchema = z.object({
  userId: z.string(),
  token: z.string().optional()
});

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * #13 — Sign the calendar-connect OAuth state with HMAC-SHA256 so the
 * callback can verify it wasn't tampered with.
 */
function encodeSignedOAuthState(state: z.infer<typeof stateSchema>): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const sig = hmacState(payload);
  return `${payload}.${sig}`;
}

function decodeSignedOAuthState(value: string): z.infer<typeof stateSchema> {
  const dot = value.lastIndexOf(".");
  if (dot < 0) throw new Error("Invalid OAuth state format");
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmacState(payload);
  // Constant-time comparison is ideal but crypto.timingSafeEqual needs Buffers:
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !sigBuf.equals(expBuf)) {
    throw new Error("OAuth state signature mismatch");
  }
  return stateSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
}

// ─── routes ─────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  /**
   * #22 — Per-email rate limit: max 3 magic-link requests per 15 minutes.
   */
  app.post("/api/auth/magic-link", async (request, reply) => {
    const { email } = emailSchema.parse(request.body);
    const lowerEmail = email.toLowerCase();

    // Per-email rate limit (Redis-backed; silently skips if no Redis in dev)
    if (redis) {
      const rlKey = `rl:magic:${lowerEmail}`;
      const count = await redis.incr(rlKey);
      if (count === 1) {
        // First request in this window — set TTL
        await redis.expire(rlKey, 15 * 60);
      }
      if (count > 3) {
        const ttl = await redis.ttl(rlKey);
        reply.header("Retry-After", String(ttl > 0 ? ttl : 900));
        return reply.code(429).send({ error: "Too many magic-link requests. Please wait before requesting another." });
      }
    }

    const token = await createMagicLinkToken(lowerEmail);
    const url = new URL("/api/auth/magic-link/verify", env.API_URL);
    url.searchParams.set("token", token);

    if (resend) {
      await resend.emails.send({
        from: env.RESEND_FROM,
        to: email,
        subject: "Sign in to Rally",
        html: `<p>Use this link to sign in to Rally:</p><p><a href="${url.toString()}">Sign in</a></p>`
      });
    } else {
      app.log.warn({ magicLink: url.toString() }, "RESEND_API_KEY missing; logging magic link for local development");
    }

    return reply.send({ ok: true });
  });

  app.get("/api/auth/magic-link/verify", async (request, reply) => {
    const query = z.object({ token: z.string().min(1) }).parse(request.query);
    // verifyMagicLinkToken now marks the jti used in Redis (#17)
    const email = await verifyMagicLinkToken(query.token);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {}
    });

    await setSessionCookie(reply, { userId: user.id, email: user.email });
    return reply.redirect(`${env.WEB_URL}/dashboard`);
  });

  /**
   * #12 — Google OAuth login: generate a random CSRF state token, store it in
   * a short-lived httpOnly cookie, and pass it to Google.
   */
  app.get("/api/auth/google", async (request, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      return reply.code(500).send({ error: "Google OAuth is not configured" });
    }

    const state = randomBytes(32).toString("hex");
    // Store state in a short-lived httpOnly cookie (5 min)
    reply.setCookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 300
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/calendar.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state); // #12 CSRF state

    return reply.redirect(url.toString());
  });

  /**
   * #12 — Verify the state cookie before exchanging the code.
   */
  app.get("/api/auth/google/callback", async (request, reply) => {
    const { code, state } = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);

    // Verify CSRF state (#12)
    const storedState = (request.cookies as Record<string, string | undefined>)["oauth_state"];
    if (!storedState || storedState !== state) {
      return reply.code(400).send({ error: "OAuth state mismatch" });
    }
    // Clear the state cookie
    reply.clearCookie("oauth_state", { path: "/", httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production" });

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return reply.code(500).send({ error: "Google OAuth is not configured" });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      request.log.error({ body: await tokenResponse.text() }, "Google token exchange failed");
      return reply.code(400).send({ error: "Google token exchange failed" });
    }

    const tokens = await tokenResponse.json();
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token as string}` }
    });

    if (!profileResponse.ok) {
      request.log.error({ body: await profileResponse.text() }, "Google profile fetch failed");
      return reply.code(400).send({ error: "Google profile fetch failed" });
    }

    const profile = googleProfileSchema.parse(await profileResponse.json());
    const user = await prisma.user.upsert({
      where: { email: profile.email.toLowerCase() },
      create: {
        email: profile.email.toLowerCase(),
        name: profile.name,
        googleToken: encryptJson(tokens)
      },
      update: {
        name: profile.name,
        googleToken: encryptJson(tokens)
      }
    });

    await setSessionCookie(reply, { userId: user.id, email: user.email });
    return reply.redirect(`${env.WEB_URL}/dashboard`);
  });

  app.get("/api/auth/google/calendar-connect", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    if (!env.GOOGLE_CLIENT_ID) {
      return reply.code(500).send({ error: "Google OAuth is not configured" });
    }

    const query = oauthQuerySchema.parse(request.query);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", googleCalendarRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/calendar.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    // #13 — HMAC-sign the state so the callback can trust userId
    url.searchParams.set("state", encodeSignedOAuthState({ userId: session.userId, token: query.token }));

    return reply.redirect(url.toString());
  });

  app.get("/api/auth/google/calendar-callback", async (request, reply) => {
    const { code, state } = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);

    // #13 — Verify HMAC signature before trusting userId in state
    let parsedState: z.infer<typeof stateSchema>;
    try {
      parsedState = decodeSignedOAuthState(state);
    } catch {
      return reply.code(400).send({ error: "Invalid OAuth state" });
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.code(500).send({ error: "Google OAuth is not configured" });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleCalendarRedirectUri(),
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      request.log.error({ body: await tokenResponse.text() }, "Google calendar token exchange failed");
      return reply.code(400).send({ error: "Google token exchange failed" });
    }

    const tokens = await tokenResponse.json();
    await prisma.user.update({
      where: { id: parsedState.userId },
      data: { googleToken: encryptJson(tokens) }
    });

    return reply.redirect(calendarRedirectTarget(parsedState.token, "google"));
  });

  app.get("/api/auth/microsoft", async (_request, reply) => {
    return reply.code(400).send({ error: "Use /api/auth/microsoft/connect to connect a calendar" });
  });

  app.get("/api/auth/microsoft/connect", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    if (!env.MICROSOFT_CLIENT_ID) {
      return reply.code(500).send({ error: "Microsoft OAuth is not configured" });
    }

    const query = oauthQuerySchema.parse(request.query);
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
    url.searchParams.set("redirect_uri", microsoftRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile Calendars.Read offline_access");
    url.searchParams.set("response_mode", "query");
    // #13 — HMAC-sign the state so the callback can trust userId
    url.searchParams.set("state", encodeSignedOAuthState({ userId: session.userId, token: query.token }));

    return reply.redirect(url.toString());
  });

  app.get("/api/auth/microsoft/callback", async (request, reply) => {
    const { code, state } = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);

    // #13 — Verify HMAC signature before trusting userId in state
    let parsedState: z.infer<typeof stateSchema>;
    try {
      parsedState = decodeSignedOAuthState(state);
    } catch {
      return reply.code(400).send({ error: "Invalid OAuth state" });
    }

    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      return reply.code(500).send({ error: "Microsoft OAuth is not configured" });
    }

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: microsoftRedirectUri(),
        grant_type: "authorization_code",
        scope: "openid email profile Calendars.Read offline_access"
      })
    });

    if (!tokenResponse.ok) {
      request.log.error({ body: await tokenResponse.text() }, "Microsoft token exchange failed");
      return reply.code(400).send({ error: "Microsoft token exchange failed" });
    }

    const tokens = await tokenResponse.json();
    await prisma.user.update({
      where: { id: parsedState.userId },
      data: { outlookToken: encryptJson(tokens) }
    });

    return reply.redirect(calendarRedirectTarget(parsedState.token, "outlook"));
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = await getSession(request);
    if (!session) return reply.code(401).send({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true }
    });

    if (!user) return reply.code(401).send({ user: null });
    return reply.send({ user });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });
}

function googleCalendarRedirectUri(): string {
  return new URL("/api/auth/google/calendar-callback", env.API_URL).toString();
}

function microsoftRedirectUri(): string {
  return env.MICROSOFT_REDIRECT_URI ?? new URL("/api/auth/microsoft/callback", env.API_URL).toString();
}

function calendarRedirectTarget(token?: string, provider?: "google" | "outlook"): string {
  if (!token) return `${env.WEB_URL}/dashboard`;
  const url = new URL(`/join/${token}/availability`, env.WEB_URL);
  url.searchParams.set("calendarConnected", "true");
  if (provider) url.searchParams.set("provider", provider);
  return url.toString();
}
