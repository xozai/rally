import type { Prisma } from "@prisma/client";
import type { ScoringParticipant } from "@rally/shared";
import { candidateIntervalsFromStarts, generateCandidateSlots, rankSuggestions } from "@rally/shared";
import { Queue, Worker } from "bullmq";
import { env } from "../env";
import { prisma } from "../lib/prisma";
import { notifyEventUpdated } from "../realtime";

export const calendarSyncQueue = env.REDIS_URL
  ? new Queue("calendar-sync", { connection: { url: env.REDIS_URL } })
  : null;

export const emailQueue = env.REDIS_URL
  ? new Queue("email-dispatch", { connection: { url: env.REDIS_URL } })
  : null;

export const suggestionRecomputeQueue = env.REDIS_URL
  ? new Queue("suggestion-recompute", { connection: { url: env.REDIS_URL } })
  : null;

export async function enqueueRecompute(eventId: string): Promise<void> {
  if (!suggestionRecomputeQueue) {
    await processSuggestionRecompute(eventId);
    return;
  }

  await suggestionRecomputeQueue.add(
    "suggestion-recompute",
    { eventId },
    {
      jobId: eventId,
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
}

export function setupWorker(): Worker | null {
  if (!env.REDIS_URL) return null;

  return new Worker(
    "suggestion-recompute",
    async (job) => {
      const eventId = typeof job.data === "object" && job.data && "eventId" in job.data ? job.data.eventId : null;
      if (typeof eventId !== "string") throw new Error("Missing eventId");
      await processSuggestionRecompute(eventId);
    },
    { connection: { url: env.REDIS_URL } }
  );
}

export async function processSuggestionRecompute(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      participants: { where: { responded: true } }
    }
  });

  if (!event) return;

  const candidateStarts = generateCandidateSlots(event.constraints as unknown as Parameters<typeof generateCandidateSlots>[0], event.duration);
  const candidates = candidateIntervalsFromStarts(candidateStarts, event.duration);
  const participants: ScoringParticipant[] = event.participants.map((participant) => ({
    id: participant.id,
    availability: jsonArray(participant.availability),
    preferences: jsonArray(participant.preferences)
  }));

  const ranked = rankSuggestions(candidates, participants, {
    eventId: event.id,
    asap: Boolean(readAsap(event.constraints))
  }).slice(0, 5);

  await prisma.$transaction([
    prisma.suggestion.deleteMany({ where: { eventId: event.id } }),
    ...ranked.map((suggestion) => prisma.suggestion.create({
      data: {
        eventId: event.id,
        startTime: new Date(suggestion.startTime),
        endTime: new Date(suggestion.endTime),
        score: suggestion.score,
        breakdown: suggestion.breakdown as unknown as Prisma.InputJsonValue,
        rank: suggestion.rank,
        ...(suggestion.votes ? { votes: suggestion.votes as Prisma.InputJsonValue } : {})
      }
    }))
  ]);

  notifyEventUpdated(event.id, { reason: "suggestions_recomputed" });
}

function jsonArray<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? value as unknown as T[] : [];
}

function readAsap(value: Prisma.JsonValue): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "asap" in value && value.asap === true;
}
