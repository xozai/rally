export type EventStatus = "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";

export type DayPreference = "any" | "weekends" | "weekdays";
export type TimeOfDayPreference = "any" | "morning" | "afternoon" | "evening";
export type SlotPreference = "preferred" | "available" | "rather_not";

export interface TimeInterval {
  start: string;
  end: string;
}

export interface EventConstraints {
  nextDays?: number;
  month?: string;
  afterDate?: string;
  dayPreference: DayPreference;
  timeOfDay: TimeOfDayPreference;
  preferredSlots: TimeInterval[];
  excludedDates: string[];
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
