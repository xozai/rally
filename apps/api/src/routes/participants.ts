import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { broadcast } from "../realtime";

const intervalSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime()
});

const availabilitySchema = z.object({
  availability: z.array(intervalSchema)
});

const preferencesSchema = z.object({
  preferences: z.array(intervalSchema.extend({
    rating: z.enum(["preferred", "available", "rather_not"])
  }))
});

export async function participantRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/participants/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const participant = await prisma.participant.findUnique({
      where: { token },
      include: { event: { select: { id: true, title: true, description: true, duration: true, constraints: true, status: true } } }
    });

    if (!participant) return reply.code(404).send({ error: "Invite not found" });
    return reply.send({ participant });
  });

  app.post("/api/participants/:token/availability", async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const { availability } = availabilitySchema.parse(request.body);
    const participant = await prisma.participant.update({
      where: { token },
      data: { availability, responded: true }
    });

    broadcast(app, { type: "participant.updated", eventId: participant.eventId });
    return reply.send({ participant });
  });

  app.post("/api/participants/:token/preferences", async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const { preferences } = preferencesSchema.parse(request.body);
    const participant = await prisma.participant.update({
      where: { token },
      data: { preferences, responded: true }
    });

    broadcast(app, { type: "participant.updated", eventId: participant.eventId });
    return reply.send({ participant });
  });

  app.post("/api/participants/:token/vote", async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);
    const { suggestionId, vote } = z.object({
      suggestionId: z.string(),
      vote: z.enum(["yes", "no", "maybe"])
    }).parse(request.body);

    const participant = await prisma.participant.findUnique({ where: { token } });
    if (!participant) return reply.code(404).send({ error: "Invite not found" });

    const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.eventId !== participant.eventId) {
      return reply.code(404).send({ error: "Suggestion not found" });
    }

    const votes = typeof suggestion.votes === "object" && suggestion.votes ? suggestion.votes as Record<string, string> : {};
    votes[participant.id] = vote;

    const updated = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: { votes }
    });

    return reply.send({ suggestion: updated });
  });
}
