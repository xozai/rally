import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

/**
 * POST /api/webhooks/resend
 *
 * Receives open/click tracking events from Resend and updates the
 * participant's emailStatus accordingly.  No authentication is required on
 * this endpoint — Resend calls it from the internet.  We rely on the fact
 * that the payload only contains Resend-controlled data and that we never
 * expose sensitive information in the response.
 *
 * Resend webhook event shape (simplified):
 * {
 *   type: "email.opened" | "email.clicked" | ...,
 *   data: { email_id: string, ... }
 * }
 */

const resendWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string()
  }).passthrough()
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/webhooks/resend", {
    config: { rateLimit: { max: 500, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = resendWebhookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid webhook payload" });
    }

    const { type, data } = parsed.data;
    const emailId = data.email_id;

    if (type === "email.opened" || type === "email.clicked") {
      const newStatus = type === "email.clicked" ? "CLICKED" : "OPENED";

      // Only upgrade the status (SENT → OPENED → CLICKED), never downgrade
      const participant = await prisma.participant.findFirst({
        where: { lastInviteEmailId: emailId },
        select: { id: true, emailStatus: true }
      });

      if (participant) {
        const shouldUpgrade =
          newStatus === "CLICKED" ||
          (newStatus === "OPENED" && participant.emailStatus === "SENT");

        if (shouldUpgrade) {
          await prisma.participant.update({
            where: { id: participant.id },
            data: { emailStatus: newStatus as "OPENED" | "CLICKED" }
          });
        }
      }
    }

    return reply.code(200).send({ received: true });
  });
}
