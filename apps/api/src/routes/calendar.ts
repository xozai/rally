import type { Prisma } from "@prisma/client";
import type { TimeInterval } from "@rally/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { env } from "../env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { prisma } from "../lib/prisma";

const querySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

interface EncryptedPayload {
  iv: string;
  authTag: string;
  data: string;
  [key: string]: string;
}

interface GoogleFreeBusyResponse {
  calendars?: {
    primary?: {
      busy?: TimeInterval[];
    };
  };
}

interface OutlookScheduleResponse {
  value?: Array<{
    scheduleItems?: Array<{
      start?: { dateTime?: string; timeZone?: string };
      end?: { dateTime?: string; timeZone?: string };
    }>;
  }>;
}

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/calendar/freebusy", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid free/busy query" });

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { googleToken: true } });
    if (!user?.googleToken) return reply.send({ busy: [], source: "none", message: "No calendar connected" });

    const token = decryptToken(user.googleToken);
    const result = await fetchGoogleFreeBusy(token.access_token, parsed.data.start, parsed.data.end);

    if (result.status === 401 && token.refresh_token) {
      const refreshed = await refreshGoogleToken(token);
      await prisma.user.update({
        where: { id: session.userId },
        data: { googleToken: encryptJson(refreshed) as unknown as Prisma.InputJsonValue }
      });
      const retry = await fetchGoogleFreeBusy(refreshed.access_token, parsed.data.start, parsed.data.end);
      if (!retry.ok) return reply.code(retry.status).send({ error: "Google Calendar free/busy failed" });
      return reply.send({ busy: retry.busy, source: "google" });
    }

    if (!result.ok) return reply.code(result.status).send({ error: "Google Calendar free/busy failed" });
    return reply.send({ busy: result.busy, source: "google" });
  });

  app.get("/api/calendar/outlook/freebusy", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid free/busy query" });

    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { outlookToken: true } });
    if (!user?.outlookToken) return reply.send({ busy: [], source: "none" });

    const token = decryptToken(user.outlookToken);
    const result = await fetchOutlookFreeBusy(token.access_token, parsed.data.start, parsed.data.end);

    if (result.status === 401 && token.refresh_token) {
      const refreshed = await refreshMicrosoftToken(token);
      await prisma.user.update({
        where: { id: session.userId },
        data: { outlookToken: encryptJson(refreshed) as unknown as Prisma.InputJsonValue }
      });
      const retry = await fetchOutlookFreeBusy(refreshed.access_token, parsed.data.start, parsed.data.end);
      if (!retry.ok) return reply.code(retry.status).send({ error: "Outlook Calendar free/busy failed" });
      return reply.send({ busy: retry.busy, source: "outlook" });
    }

    if (!result.ok) return reply.code(result.status).send({ error: "Outlook Calendar free/busy failed" });
    return reply.send({ busy: result.busy, source: "outlook" });
  });
}

function decryptToken(value: Prisma.JsonValue): OAuthToken {
  if (!isEncryptedPayload(value)) throw new Error("Stored token is invalid");
  return decryptJson<OAuthToken>(value);
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).iv === "string"
    && typeof (value as Record<string, unknown>).authTag === "string"
    && typeof (value as Record<string, unknown>).data === "string";
}

async function fetchGoogleFreeBusy(accessToken: string, start: string, end: string): Promise<{ ok: boolean; status: number; busy: TimeInterval[] }> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      timeMin: start,
      timeMax: end,
      items: [{ id: "primary" }]
    })
  });

  if (!response.ok) return { ok: false, status: response.status, busy: [] };
  const body = await response.json() as GoogleFreeBusyResponse;
  return { ok: true, status: response.status, busy: body.calendars?.primary?.busy ?? [] };
}

async function fetchOutlookFreeBusy(accessToken: string, start: string, end: string): Promise<{ ok: boolean; status: number; busy: TimeInterval[] }> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      schedules: ["me"],
      startTime: { dateTime: start, timeZone: "UTC" },
      endTime: { dateTime: end, timeZone: "UTC" },
      availabilityViewInterval: 30
    })
  });

  if (!response.ok) return { ok: false, status: response.status, busy: [] };
  const body = await response.json() as OutlookScheduleResponse;
  const busy = body.value?.flatMap((schedule) => schedule.scheduleItems ?? [])
    .flatMap((item) => item.start?.dateTime && item.end?.dateTime ? [{
      start: ensureIso(item.start.dateTime),
      end: ensureIso(item.end.dateTime)
    }] : []) ?? [];

  return { ok: true, status: response.status, busy };
}

async function refreshGoogleToken(token: OAuthToken): Promise<OAuthToken> {
  if (!token.refresh_token || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google token refresh is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) throw new Error("Google token refresh failed");
  const refreshed = await response.json() as OAuthToken;
  return { ...token, ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token };
}

async function refreshMicrosoftToken(token: OAuthToken): Promise<OAuthToken> {
  if (!token.refresh_token || !env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) throw new Error("Microsoft token refresh is not configured");
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
      scope: "openid email profile Calendars.Read offline_access"
    })
  });

  if (!response.ok) throw new Error("Microsoft token refresh failed");
  const refreshed = await response.json() as OAuthToken;
  return { ...token, ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token };
}

function ensureIso(value: string): string {
  return value.endsWith("Z") ? value : `${value}Z`;
}
