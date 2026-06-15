import { Queue } from "bullmq";
import { env } from "../env";

export const calendarSyncQueue = env.REDIS_URL
  ? new Queue("calendar-sync", { connection: { url: env.REDIS_URL } })
  : null;

export const emailQueue = env.REDIS_URL
  ? new Queue("email-dispatch", { connection: { url: env.REDIS_URL } })
  : null;

export const suggestionRecomputeQueue = env.REDIS_URL
  ? new Queue("suggestion-recompute", { connection: { url: env.REDIS_URL } })
  : null;
