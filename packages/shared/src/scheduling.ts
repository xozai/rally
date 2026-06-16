import type {
  CandidateSlot,
  PreferenceBlock,
  ScoringParticipant,
  SlotPreference,
  Suggestion
} from "./types";

const PREFERENCE_POINTS: Record<SlotPreference, number> = {
  preferred: 2,
  available: 1,
  rather_not: -1
};

export interface ScoreOptions {
  eventId: string;
  asap?: boolean;
  now?: Date;
}

export function rankSuggestions(
  candidates: CandidateSlot[],
  participants: ScoringParticipant[],
  options: ScoreOptions
): Suggestion[] {
  const now = options.now ?? new Date();

  return candidates
    .map((candidate) => scoreSlot(candidate, participants, options.eventId, now, Boolean(options.asap)))
    .sort((a, b) => b.score - a.score || a.startTime.localeCompare(b.startTime))
    .slice(0, 5)
    .map((suggestion, index) => ({ ...suggestion, rank: index + 1 }));
}

export function scoreSlot(
  candidate: CandidateSlot,
  participants: ScoringParticipant[],
  eventId: string,
  now: Date,
  asap: boolean
): Suggestion {
  const breakdown = {
    free: [] as string[],
    preferred: [] as string[],
    available: [] as string[],
    undesirable: [] as string[],
    unavailable: [] as string[],
    penalties: [] as Array<{ participantId: string; reason: string; points: number }>
  };

  let baseScore = 0;
  let preferenceScore = 0;
  let penalty = 0;

  for (const participant of participants) {
    if (!overlapsAny(candidate, participant.availability)) {
      breakdown.unavailable.push(participant.id);
      continue;
    }

    baseScore += 1;
    breakdown.free.push(participant.id);

    const rating = findPreference(candidate, participant.preferences)?.rating ?? "available";
    preferenceScore += PREFERENCE_POINTS[rating];

    if (rating === "preferred") breakdown.preferred.push(participant.id);
    if (rating === "available") breakdown.available.push(participant.id);
    if (rating === "rather_not") breakdown.undesirable.push(participant.id);

    if (isNearBlackout(candidate, participant.blackouts ?? [])) {
      penalty += 0.5;
      breakdown.penalties.push({
        participantId: participant.id,
        reason: "Slot is close to a blackout window",
        points: -0.5
      });
    }
  }

  if (candidate.organizerRating === "rather_not") {
    penalty += 1;
    breakdown.penalties.push({
      participantId: "organizer",
      reason: "Organizer marked this time as low preference",
      points: -1
    });
  }

  const recencyBonus = asap ? calculateRecencyBonus(candidate.start, now) : 0;
  const score = baseScore + preferenceScore - penalty + recencyBonus;

  return {
    eventId,
    startTime: candidate.start,
    endTime: candidate.end,
    score: Number(score.toFixed(3)),
    breakdown,
    rank: 0,
    votes: null
  };
}

function findPreference(candidate: CandidateSlot, preferences: PreferenceBlock[]): PreferenceBlock | undefined {
  return preferences.find((preference) => containsInterval(preference, candidate));
}

function overlapsAny(candidate: CandidateSlot, intervals: Array<{ start: string; end: string }>): boolean {
  return intervals.some((interval) => containsInterval(interval, candidate));
}

function containsInterval(outer: { start: string; end: string }, inner: { start: string; end: string }): boolean {
  return new Date(outer.start).getTime() <= new Date(inner.start).getTime()
    && new Date(outer.end).getTime() >= new Date(inner.end).getTime();
}

function isNearBlackout(candidate: CandidateSlot, blackouts: Array<{ start: string; end: string }>): boolean {
  const start = new Date(candidate.start).getTime();
  const end = new Date(candidate.end).getTime();
  const oneHour = 60 * 60 * 1000;

  return blackouts.some((blackout) => {
    const blackoutStart = new Date(blackout.start).getTime();
    const blackoutEnd = new Date(blackout.end).getTime();
    return Math.abs(start - blackoutEnd) <= oneHour || Math.abs(blackoutStart - end) <= oneHour;
  });
}

function calculateRecencyBonus(start: string, now: Date): number {
  const daysAway = Math.max(0, (new Date(start).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, 1.0 - daysAway * 0.1);
}
