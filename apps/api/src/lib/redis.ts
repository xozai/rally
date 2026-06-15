import Redis from "ioredis";
import { env } from "../env";

/**
 * Shared ioredis client. Null when REDIS_URL is not configured (dev without Redis).
 * BullMQ (already a direct dependency) bundles ioredis, so no extra install is needed.
 */
export const redis: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null }) : null;
