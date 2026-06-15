import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { prisma } from "../lib/prisma";

const intervalSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

const eventInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  duration: z.number().int().positive(),
  constraints: z.object({
    nextDays: z.number().int().positive().optional(),
    month: z.string().optional(),
    afterDate: z.string().datetime().optional(),
    dayPreference: z.enum(["any", "weekends", "weekdays"]),
    timeOfDay: z.enum(["any", "morning", "afternoon", "evening"]),
    preferredSlots: z.array(intervalSchema),
    excludedDates: z.array(z.string()),
    asap: z.boolean().optional()
  }),
  expiresAt: z.string().datetime().optional()
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/events", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const input = eventInputSchema.parse(request.body);
    const event = await prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        duration: input.duration,
        constraints: input.constraints,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        organizerId: session.userId
      }
    });

    return reply.code(201).send({ event });
  });

  app.get("/api/events/:id", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const event = await prisma.event.findFirst({
      where: { id, organizerId: session.userId },
      include: { participants: true, suggestions: { orderBy: { rank: "asc" } } }
    });

    if (!event) return reply.code(404).send({ error: "Event not found" });
    return reply.send({ event });
  });

  app.patch("/api/events/:id/confirm", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { finalSlot } = z.object({ finalSlot: z.string().datetime() }).parse(request.body);
    const existing = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    const event = await prisma.event.update({
      where: { id },
      data: { finalSlot: new Date(finalSlot), status: "CONFIRMED" }
    });

    return reply.send({ event });
  });

  app.post("/api/events/:id/participants", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = inviteSchema.parse(request.body);
    const event = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!event) return reply.code(404).send({ error: "Event not found" });

    const participant = await prisma.participant.create({
      data: {
        eventId: id,
        email: input.email.toLowerCase(),
        name: input.name,
        token: randomBytes(24).toString("hex"),
        availability: [],
        preferences: []
      }
    });

    return reply.code(201).send({ participant });
  });

  app.get("/api/events/:id/suggestions", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const suggestions = await prisma.suggestion.findMany({
      where: { eventId: id, event: { organizerId: session.userId } },
      orderBy: { rank: "asc" }
    });

    return reply.send({ suggestions });
  });

  app.post("/api/events/:id/poll", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.event.findFirst({ where: { id, organizerId: session.userId } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    const event = await prisma.event.update({
      where: { id },
      data: { status: "VOTING" }
    });

    return reply.send({ event });
  });
}
