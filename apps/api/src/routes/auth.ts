import type { FastifyInstance } from "fastify";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../env";
import { encryptJson } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import { clearSessionCookie, createMagicLinkToken, getSession, setSessionCookie, verifyMagicLinkToken } from "../auth/session";

const emailSchema = z.object({
  email: z.string().email()
});

const googleProfileSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

  app.post("/api/auth/magic-link", async (request, reply) => {
    const { email } = emailSchema.parse(request.body);
    const token = await createMagicLinkToken(email.toLowerCase());
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
    const email = await verifyMagicLinkToken(query.token);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email },
      update: {}
    });

    await setSessionCookie(reply, { userId: user.id, email: user.email });
    return reply.redirect(`${env.WEB_URL}/dashboard`);
  });

  app.get("/api/auth/google", async (_request, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      return reply.code(500).send({ error: "Google OAuth is not configured" });
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/calendar.readonly");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    return reply.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (request, reply) => {
    const { code } = z.object({ code: z.string().min(1) }).parse(request.query);

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
      request.log.error(await tokenResponse.text(), "Google token exchange failed");
      return reply.code(400).send({ error: "Google token exchange failed" });
    }

    const tokens = await tokenResponse.json();
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token as string}` }
    });

    if (!profileResponse.ok) {
      request.log.error(await profileResponse.text(), "Google profile fetch failed");
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

  app.get("/api/auth/microsoft", async (_request, reply) => {
    return reply.code(501).send({ error: "Microsoft OAuth is reserved for Phase 2 calendar integration" });
  });

  app.get("/api/auth/microsoft/callback", async (_request, reply) => {
    return reply.code(501).send({ error: "Microsoft OAuth is reserved for Phase 2 calendar integration" });
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
