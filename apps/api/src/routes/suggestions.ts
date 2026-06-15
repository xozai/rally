import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/require-user";
import { enqueueRecompute } from "../jobs/queues";
import { prisma } from "../lib/prisma";

const computeSchema = z.object({
  eventId: z.string().min(1)
});

export async function suggestionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/suggestions/compute", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    const parsedBody = computeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: parsedBody.error.issues[0]?.message ?? "Invalid suggestion input" });
    }

    const event = await prisma.event.findFirst({
      where: { id: parsedBody.data.eventId, organizerId: session.userId },
      select: { id: true }
    });

    if (!event) return reply.code(404).send({ error: "Event not found" });

    await enqueueRecompute(event.id);
    return reply.send({ queued: true });
  });
}
