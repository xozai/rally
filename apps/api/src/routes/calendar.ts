import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/require-user";

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/calendar/freebusy", async (request, reply) => {
    const session = await requireUser(request, reply);
    if (!session) return;

    z.object({
      start: z.string().datetime(),
      end: z.string().datetime(),
      provider: z.enum(["google", "microsoft"]).default("google")
    }).parse(request.query);

    return reply.send({
      busy: [],
      note: "Calendar free/busy sync is reserved for Phase 2. Raw calendar event data is never stored."
    });
  });
}
