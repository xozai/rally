export type EventStatus = "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";

export type WindowType = "next_n_days" | "specific_month" | "after_date" | "date_range";
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type TimeOfDay = "any" | "morning" | "afternoon" | "evening" | "custom";
export type SlotPreference = "preferred" | "available" | "rather_not";

export interface TimeInterval {
  start: string;
  end: string;
}

/**
 * Canonical shape of the `constraints` JSON column.
 * This matches the schema validated and written by the API (eventInputSchema).
 *
 * Legacy fields (marked @deprecated) exist only for backward-compatibility with
 * records created before the v2 constraint schema; they are no longer written by
 * the API but may still appear in older database rows.
 */
export interface EventConstraints {
  // ── Current fields (written by API v2+) ────────────────────────────────────
  windowType?: WindowType;
  windowStart?: string;
  windowEnd?: string;
  nDays?: number;
  /** Stored as a number in new records; may be a numeric string in legacy rows (see #19). */
  month?: number | string;
  year?: number;
  daysOfWeek?: DayOfWeek[];
  timeOfDay?: TimeOfDay;
  customStart?: string;
  customEnd?: string;
  excludeDates?: string[];
  timezone?: string;
  // ── Legacy fields (read for backward-compat; no longer written) ─────────────
  /** @deprecated Use windowType + nDays instead. */
  nextDays?: number;
  /** @deprecated Use windowType + windowStart instead. */
  afterDate?: string;
  /** @deprecated Use daysOfWeek instead. */
  dayPreference?: "any" | "weekdays" | "weekends";
  /** @deprecated Use excludeDates instead. */
  excludedDates?: string[];
  /** @deprecated No longer stored. */
  preferredSlots?: TimeInterval[];
  /** @deprecated No longer stored. */
  asap?: boolean;
}

export interface RallyEvent {
  id: string;
  title: string;
  description?: string | null;
  organizerId: string;
  duration: number;
  constraints: EventConstraints;
  status: EventStatus;
  finalSlot?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface Participant {
  id: string;
  eventId: string;
  userId?: string | null;
  email: string;
  name?: string | null;
  token: string;
  availability: TimeInterval[];
  preferences: PreferenceBlock[];
  responded: boolean;
  createdAt: string;
}

export interface PreferenceBlock extends TimeInterval {
  rating: SlotPreference;
}

export interface SuggestionBreakdown {
  free: string[];
  preferred: string[];
  available: string[];
  undesirable: string[];
  unavailable: string[];
  penalties: Array<{ participantId: string; reason: string; points: number }>;
}

export interface Suggestion {
  id?: string;
  eventId: string;
  startTime: string;
  endTime: string;
  score: number;
  breakdown: SuggestionBreakdown;
  rank: number;
  votes?: Record<string, "yes" | "no" | "maybe"> | null;
}

export interface ScoringParticipant {
  id: string;
  availability: TimeInterval[];
  preferences: PreferenceBlock[];
  blackouts?: TimeInterval[];
}

export interface CandidateSlot extends TimeInterval {
  organizerRating?: SlotPreference;
}
