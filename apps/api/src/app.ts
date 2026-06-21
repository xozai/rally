import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./env";
import { setupRealtime } from "./realtime";
import { setupWorker } from "./jobs/queues";
import { authRoutes } from "./routes/auth";
import { calendarRoutes } from "./routes/calendar";
import { eventRoutes } from "./routes/events";
import { healthRoutes } from "./routes/health";
import { participantRoutes } from "./routes/participants";
import { suggestionRoutes } from "./routes/suggestions";
import { webhookRoutes } from "./routes/webhooks";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.WEB_URL,
    credentials: true
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  setupRealtime(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(eventRoutes);
  await app.register(participantRoutes);
  await app.register(calendarRoutes);
  await app.register(suggestionRoutes);
  await app.register(webhookRoutes);

  // Start the BullMQ worker that processes suggestion-recompute jobs (#10)
  setupWorker();

  return app;
}
