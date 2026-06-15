import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { sendInviteEmail } from "../lib/resend";

const dateStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const eventInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  duration: z.number().int().positive(),
  constraints: z.object({
    windowType: z.enum(["next_n_days", "specific_month", "after_date", "date_range"]),
    windowStart: dateStringSchema.optional(),
    windowEnd: dateStringSchema.optional(),
    nDays: z.number().int().positive().optional(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(1970).max(9999).optional(),
    daysOfWeek: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "custom"]).optional(),
    customStart: timeStringSchema.optional(),
    customEnd: timeStringSchema.optional(),
    excludeDates: z.array(dateStringSchema).optional()
  })
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

const confirmSchema = z.object({
  finalSlot: z.string().datetime()
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/events", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsed = eventInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid event input" });

    const input = parsed.data;
    const event = await prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        duration: input.duration,
        constraints: input.constraints as Prisma.InputJsonValue,
        status: "OPEN",
        organizerId: session.userId
      }
    });

    return reply.code(201).send({ event: serializeEvent(event) });
  });

  app.get("/api/events", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const events = await prisma.event.findMany({
      where: { organizerId: session.userId },
      orderBy: { createdAt: "desc" },
      include: {
        participants: { select: { id: true, responded: true } },
        suggestions: { orderBy: { rank: "asc" } }
      }
    });

    return reply.send({ events: events.map((event) => serializeEventWithCounts(event)) });
  });

  app.get("/api/events/:id", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const { id } = parsedParams.data;
    const event = await prisma.event.findFirst({
      where: { id, organizerId: session.userId },
      include: {
        participants: {
          select: {
            id: true,
            eventId: true,
            userId: true,
            email: true,
            name: true,
            responded: true,
            createdAt: true
          },
          orderBy: { createdAt: "asc" }
        },
        suggestions: { orderBy: { rank: "asc" } }
      }
    });

    if (!event) return reply.code(404).send({ error: "Event not found" });
    return reply.send({ event: serializeOrganizerEvent(event) });
  });

  app.get("/api/events/:id/ics", async (request, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const event = await prisma.event.findUnique({ where: { id: parsedParams.data.id } });
    if (!event || event.status !== "CONFIRMED" || !event.finalSlot) {
      return reply.code(404).send({ error: "Confirmed event not found" });
    }

    const start = event.finalSlot;
    const end = new Date(start.getTime() + event.duration * 60_000);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Rally//Rally//EN",
      "BEGIN:VEVENT",
      `UID:${event.id}@rally.app`,
      `DTSTAMP:${formatIcalDate(new Date())}`,
      `DTSTART:${formatIcalDate(start)}`,
      `DTEND:${formatIcalDate(end)}`,
      `SUMMARY:${escapeIcalText(event.title)}`,
      `DESCRIPTION:${escapeIcalText(event.description ?? "")}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    reply.header("Content-Type", "text/calendar; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="rally-${event.id}.ics"`);
    return reply.send(ics);
  });

  app.patch("/api/events/:id/confirm", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const parsedBody = confirmSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid confirmation input" });

    const { id } = parsedParams.data;
    const { finalSlot } = parsedBody.data;
    const existing = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    const event = await prisma.event.update({
      where: { id },
      data: { finalSlot: new Date(finalSlot), status: "CONFIRMED" }
    });

    return reply.send({ event: serializeEvent(event) });
  });

  app.post("/api/events/:id/participants", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const parsedBody = inviteSchema.safeParse(request.body);
    if (!parsedBody.success) return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid invite input" });

    const { id } = parsedParams.data;
    const input = parsedBody.data;
    const event = await prisma.event.findFirst({
      where: { id, organizerId: session.userId },
      include: { organizer: { select: { name: true, email: true } } }
    });
    if (!event) return reply.code(404).send({ error: "Event not found" });

    const participant = await prisma.participant.create({
      data: {
        eventId: id,
        email: input.email.toLowerCase(),
        name: input.name,
        token: randomUUID(),
        availability: [],
        preferences: {}
      }
    });

    const inviteUrl = new URL(`/join/${participant.token}`, env.WEB_URL).toString();
    await sendInviteEmail(
      participant.email,
      participant.name ?? participant.email,
      event.title,
      event.organizer.name ?? event.organizer.email,
      inviteUrl
    );

    return reply.code(201).send({ participant: redactParticipant(participant) });
  });

  app.get("/api/events/:id/suggestions", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const { id } = parsedParams.data;
    const suggestions = await prisma.suggestion.findMany({
      where: { eventId: id, event: { organizerId: session.userId } },
      orderBy: { rank: "asc" }
    });

    return reply.send({ suggestions: suggestions.map(serializeSuggestion) });
  });

  app.post("/api/events/:id/poll", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const { id } = parsedParams.data;
    const existing = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    const event = await prisma.event.update({
      where: { id },
      data: { status: "VOTING" }
    });

    const suggestions = await prisma.suggestion.findMany({
      where: { eventId: id },
      orderBy: { rank: "asc" },
      take: 3
    });

    return reply.send({ event: serializeEvent(event), suggestions: suggestions.map(serializeSuggestion) });
  });

  app.delete("/api/events/:id", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedParams = z.object({ id: z.string() }).safeParse(request.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "Invalid event id" });

    const { id } = parsedParams.data;
    const existing = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    await prisma.suggestion.deleteMany({ where: { eventId: id } });
    await prisma.participant.deleteMany({ where: { eventId: id } });
    await prisma.event.delete({ where: { id } });

    return reply.code(204).send();
  });
}

type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  organizerId: string;
  duration: number;
  constraints: Prisma.JsonValue;
  status: string;
  finalSlot: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
};

type ParticipantRecord = {
  id: string;
  eventId: string;
  userId: string | null;
  email: string;
  name: string | null;
  responded: boolean;
  createdAt: Date;
};

type PrivateParticipantRecord = ParticipantRecord & {
  token: string;
  availability: Prisma.JsonValue;
  preferences: Prisma.JsonValue;
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

function serializeEvent(event: EventRecord) {
  return {
    ...event,
    constraints: event.constraints,
    finalSlot: event.finalSlot?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    expiresAt: event.expiresAt?.toISOString() ?? null
  };
}

function serializeOrganizerEvent(event: EventRecord & { participants: ParticipantRecord[]; suggestions: SuggestionRecord[] }) {
  return {
    ...serializeEvent(event),
    participants: event.participants.map((participant) => ({
      ...participant,
      createdAt: participant.createdAt.toISOString()
    })),
    suggestions: event.suggestions.map(serializeSuggestion)
  };
}

function serializeEventWithCounts(event: EventRecord & { participants: Array<{ id: string; responded: boolean }>; suggestions: SuggestionRecord[] }) {
  return {
    ...serializeEvent(event),
    responseCount: event.participants.filter((participant) => participant.responded).length,
    participantCount: event.participants.length,
    suggestions: event.suggestions.map(serializeSuggestion)
  };
}

function serializeSuggestion(suggestion: SuggestionRecord) {
  return {
    ...suggestion,
    startTime: suggestion.startTime.toISOString(),
    endTime: suggestion.endTime.toISOString()
  };
}

function redactParticipant(participant: PrivateParticipantRecord) {
  return {
    id: participant.id,
    eventId: participant.eventId,
    userId: participant.userId,
    email: participant.email,
    name: participant.name,
    responded: participant.responded,
    createdAt: participant.createdAt.toISOString()
  };
}

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
