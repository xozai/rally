import type { Prisma } from "@prisma/client";
import type { PreferenceBlock, TimeInterval } from "@rally/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { enqueueRecompute } from "../jobs/queues";
import { prisma } from "../lib/prisma";
import { notifyEventUpdated, notifyParticipantResponded } from "../realtime";

const intervalSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

const availabilitySchema = z.object({
  availability: z.array(intervalSchema),
  source: z.enum(["manual", "google", "outlook"])
});

const preferencesSchema = z.object({
  preferences: z.array(intervalSchema.extend({
    rating: z.enum(["preferred", "available", "rather_not"])
  }))
});

const rsvpSchema = z.object({
  rsvp: z.enum(["attending", "declined", "maybe"])
});

export async function participantRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/participants/:token", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const { token } = parsedParams.data;
    const participant = await prisma.participant.findUnique({
      where: { token },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            duration: true,
            constraints: true,
            status: true,
            finalSlot: true,
            participants: { select: { responded: true } },
            suggestions: { orderBy: { rank: "asc" } },
            organizer: { select: { name: true, email: true } }
          }
        }
      }
    });

    if (!participant) return reply.code(404).send({ error: "Invite not found" });
    if (participant.expiresAt && participant.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite link has expired" });
    }
    return reply.send({ participant: serializeGuestParticipant(participant) });
  });

  app.post("/api/participants/:token/availability", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const parsedBody = availabilitySchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid availability input" });

    const { token } = parsedParams.data;
    const { availability, source } = parsedBody.data;
    const existing = await prisma.participant.findUnique({
      where: { token },
      include: { event: { select: { expiresAt: true } } }
    });
    if (!existing) return reply.code(404).send({ error: "Invite not found" });

    // #30 — enforce event expiry
    if (existing.event.expiresAt && existing.event.expiresAt < new Date()) {
      return reply.code(410).send({ error: "This Rally has expired" });
    }
    if (existing.expiresAt && existing.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite link has expired" });
    }

    const participant = await prisma.participant.update({
      where: { token },
      data: { availability: availability as Prisma.InputJsonValue, responded: hasPreferences(existing.preferences) }
    });

    await enqueueSuggestionRecompute(participant.eventId, source);
    await notifyResponseCounts(participant.eventId);
    return reply.send({ participant: serializePrivateParticipant(participant) });
  });

  app.post("/api/participants/:token/preferences", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const parsedBody = preferencesSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid preferences input" });

    const { token } = parsedParams.data;
    const { preferences } = parsedBody.data;
    const existing = await prisma.participant.findUnique({ where: { token } });
    if (!existing) return reply.code(404).send({ error: "Invite not found" });
    if (existing.expiresAt && existing.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite link has expired" });
    }

    const participant = await prisma.participant.update({
      where: { token },
      data: { preferences: preferences as Prisma.InputJsonValue, responded: hasAvailability(existing.availability) }
    });

    await enqueueSuggestionRecompute(participant.eventId, "manual");
    await notifyResponseCounts(participant.eventId);
    return reply.send({ participant: serializePrivateParticipant(participant) });
  });

  app.post("/api/participants/:token/vote", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const parsedBody = z.object({
      suggestionId: z.string(),
      vote: z.enum(["yes", "no", "maybe"])
    }).safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid vote input" });

    const { token } = parsedParams.data;
    const { suggestionId, vote } = parsedBody.data;
    const participant = await prisma.participant.findUnique({ where: { token } });
    if (!participant) return reply.code(404).send({ error: "Invite not found" });
    if (participant.expiresAt && participant.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite link has expired" });
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.eventId !== participant.eventId) {
      return reply.code(404).send({ error: "Suggestion not found" });
    }

    const votes = typeof suggestion.votes === "object" && suggestion.votes ? suggestion.votes as Record<string, string> : {};
    votes[participant.id] = vote;

    const updated = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: { votes: votes as Prisma.InputJsonValue }
    });

    notifyEventUpdated(participant.eventId, { reason: "vote_updated" });
    return reply.send({ suggestion: serializeSuggestion(updated) });
  });

  // #29 — RSVP endpoint
  app.patch("/api/participants/:token/rsvp", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const parsedBody = rsvpSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid RSVP value" });

    const { token } = parsedParams.data;
    const { rsvp } = parsedBody.data;
    const existing = await prisma.participant.findUnique({ where: { token } });
    if (!existing) return reply.code(404).send({ error: "Invite not found" });
    if (existing.expiresAt && existing.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite link has expired" });
    }

    const participant = await prisma.participant.update({
      where: { token },
      data: { rsvp }
    });

    await notifyResponseCounts(participant.eventId);
    return reply.send({ participant: serializePrivateParticipant(participant) });
  });

  // #34 — GDPR right-to-erasure
  app.delete("/api/participants/:token", async (request, reply) => {
    const parsedParams = z.object({ token: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid invite token" });

    const { token } = parsedParams.data;
    const existing = await prisma.participant.findUnique({ where: { token } });
    if (!existing) return reply.code(404).send({ error: "Invite not found" });

    await prisma.participant.update({
      where: { token },
      data: {
        availability: [] as Prisma.InputJsonValue,
        preferences: {} as Prisma.InputJsonValue,
        email: "[deleted]",
        name: null,
        rsvp: null
      }
    });

    return reply.send({ message: "Your data has been deleted" });
  });
}

type ParticipantRecord = {
  id: string;
  eventId: string;
  userId: string | null;
  email: string;
  name: string | null;
  availability: Prisma.JsonValue;
  preferences: Prisma.JsonValue;
  responded: boolean;
  rsvp: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

type GuestParticipantRecord = ParticipantRecord & {
  event: {
    id: string;
    title: string;
    description: string | null;
    duration: number;
    constraints: Prisma.JsonValue;
    status: string;
    finalSlot: Date | null;
    participants: Array<{ responded: boolean }>;
    suggestions: SuggestionRecord[];
    organizer: { name: string | null; email: string };
  };
};

type SuggestionRecord = {
  id: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  score: number;
  breakdown: Prisma.JsonValue;
  rank: number;
  votes: Prisma.JsonValue | null;
};

function serializeGuestParticipant(participant: GuestParticipantRecord) {
  return {
    id: participant.id,
    eventId: participant.eventId,
    email: participant.email,
    name: participant.name,
    availability: jsonArray<TimeInterval>(participant.availability),
    preferences: jsonArray<PreferenceBlock>(participant.preferences),
    responded: participant.responded,
    rsvp: participant.rsvp,
    createdAt: participant.createdAt.toISOString(),
    event: {
      id: participant.event.id,
      title: participant.event.title,
      description: participant.event.description,
      duration: participant.event.duration,
      constraints: participant.event.constraints,
      status: participant.event.status,
      finalSlot: participant.event.finalSlot?.toISOString() ?? null,
      responseCount: participant.event.participants.filter((item) => item.responded).length,
      participantCount: participant.event.participants.length,
      suggestions: participant.event.suggestions.map(serializeSuggestion),
      organizerName: participant.event.organizer.name ?? participant.event.organizer.email
    }
  };
}

function serializePrivateParticipant(participant: ParticipantRecord) {
  return {
    id: participant.id,
    eventId: participant.eventId,
    userId: participant.userId,
    email: participant.email,
    name: participant.name,
    availability: jsonArray<TimeInterval>(participant.availability),
    preferences: jsonArray<PreferenceBlock>(participant.preferences),
    responded: participant.responded,
    rsvp: participant.rsvp,
    createdAt: participant.createdAt.toISOString()
  };
}

function hasAvailability(value: Prisma.JsonValue): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasPreferences(value: Prisma.JsonValue): boolean {
  return Array.isArray(value) && value.length > 0;
}

function jsonArray<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? value as unknown as T[] : [];
}

function serializeSuggestion(suggestion: SuggestionRecord) {
  return {
    ...suggestion,
    startTime: suggestion.startTime.toISOString(),
    endTime: suggestion.endTime.toISOString()
  };
}

async function notifyResponseCounts(eventId: string): Promise<void> {
  const counts = await prisma.participant.groupBy({
    by: ["responded"],
    where: { eventId },
    _count: { _all: true }
  });

  const totalCount = counts.reduce((sum, item) => sum + item._count._all, 0);
  const respondedCount = counts.find((item) => item.responded)?._count._all ?? 0;
  notifyParticipantResponded(eventId, respondedCount, totalCount);
}

async function enqueueSuggestionRecompute(eventId: string, source: "manual" | "google" | "outlook"): Promise<void> {
  void source;
  await enqueueRecompute(eventId);
}
