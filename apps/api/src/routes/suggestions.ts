import type { FastifyInstance } from "fastify";
import { rankSuggestions, type CandidateSlot, type ScoringParticipant } from "@rally/shared";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { prisma } from "../lib/prisma";
import { broadcast } from "../realtime";

const computeSchema = z.object({
  eventId: z.string(),
  candidates: z.array(z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    organizerRating: z.enum(["preferred", "available", "rather_not"]).optional()
  }))
});

export async function suggestionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/suggestions/compute", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const input = computeSchema.parse(request.body);
    const event = await prisma.event.findFirst({
      where: { id: input.eventId, organizerId: session.userId },
      include: { participants: true }
    });

    if (!event) return reply.code(404).send({ error: "Event not found" });

    const participants: ScoringParticipant[] = event.participants.map((participant) => ({
      id: participant.id,
      availability: participant.availability as ScoringParticipant["availability"],
      preferences: participant.preferences as ScoringParticipant["preferences"]
    }));

    const ranked = rankSuggestions(input.candidates as CandidateSlot[], participants, {
      eventId: event.id,
      asap: Boolean((event.constraints as { asap?: boolean }).asap)
    });

    await prisma.suggestion.deleteMany({ where: { eventId: event.id } });
    const suggestions = await Promise.all(ranked.map((suggestion) => prisma.suggestion.create({
      data: {
        eventId: event.id,
        startTime: new Date(suggestion.startTime),
        endTime: new Date(suggestion.endTime),
        score: suggestion.score,
        breakdown: suggestion.breakdown,
        rank: suggestion.rank,
        votes: suggestion.votes ?? {}
      }
    })));

    broadcast(app, { type: "suggestions.updated", eventId: event.id });
    return reply.send({ suggestions });
  });
}
