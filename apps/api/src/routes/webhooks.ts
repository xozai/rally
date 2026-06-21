import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { z } from "zod";
import { env } from "../env";
import { prisma } from "../lib/prisma";

/**
 * POST /api/webhooks/resend
 *
 * Receives signed open/click tracking events from Resend and updates the
 * participant's emailStatus accordingly.
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
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/api/webhooks/resend", {
    config: { rateLimit: { max: 500, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (!env.RESEND_WEBHOOK_SECRET) {
      return reply.code(500).send({ error: "Resend webhook secret is not configured" });
    }

    const rawBody = request.body;
    if (!Buffer.isBuffer(rawBody)) {
      return reply.code(400).send({ error: "Invalid webhook payload" });
    }

    const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
    try {
      wh.verify(rawBody, {
        "svix-id": request.headers["svix-id"] as string,
        "svix-timestamp": request.headers["svix-timestamp"] as string,
        "svix-signature": request.headers["svix-signature"] as string
      });
    } catch {
      return reply.code(400).send({ error: "Invalid webhook signature" });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return reply.code(400).send({ error: "Invalid webhook payload" });
    }

    const parsed = resendWebhookSchema.safeParse(body);
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
