import type { EventConstraints, PreferenceBlock, TimeInterval } from "@rally/shared";
import { generateCandidateSlots } from "@rally/shared";

export type EventStatus = "OPEN" | "VOTING" | "CONFIRMED" | "CANCELLED";

export interface JoinParticipant {
  id: string;
  eventId: string;
  email: string;
  name: string | null;
  availability: TimeInterval[];
  preferences: PreferenceBlock[];
  responded: boolean;
  createdAt: string;
  event: {
    id: string;
    title: string;
    description: string | null;
    duration: number;
    constraints: EventConstraints;
    status: EventStatus;
    finalSlot: string | null;
    responseCount: number;
    participantCount: number;
    suggestions: JoinSuggestion[];
    organizerName: string;
  };
}

export interface JoinSuggestion {
  id: string;
  eventId: string;
  startTime: string;
  endTime: string;
  score: number;
  breakdown: {
    free?: string[];
    preferred?: string[];
    available?: string[];
    unavailable?: string[];
    undesirable?: string[];
  };
  rank: number;
  votes?: Record<string, "yes" | "no" | "maybe"> | null;
}

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export function slotsForParticipant(participant: JoinParticipant): string[] {
  return generateCandidateSlots(participant.event.constraints, participant.event.duration);
}

export function windowBounds(slots: string[]): { start: string; end: string } | null {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort();
  const start = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!start || !last) return null;
  return {
    start,
    end: new Date(new Date(last).getTime() + 30 * 60_000).toISOString()
  };
}

export function invertBusySlots(slots: string[], busy: TimeInterval[]): TimeInterval[] {
  const free = slots.filter((slot) => {
    const start = new Date(slot).getTime();
    const end = start + 30 * 60_000;
    return !busy.some((interval) => new Date(interval.start).getTime() < end && new Date(interval.end).getTime() > start);
  });
  return mergeSlotStarts(free);
}

export function mergeSlotStarts(slots: string[]): TimeInterval[] {
  const sorted = [...slots].sort();
  const intervals: TimeInterval[] = [];
  let currentStart: string | null = null;
  let currentEnd = 0;

  for (const slot of sorted) {
    const start = new Date(slot).getTime();
    const end = start + 30 * 60_000;
    if (currentStart && start === currentEnd) {
      currentEnd = end;
      continue;
    }
    if (currentStart) intervals.push({ start: currentStart, end: new Date(currentEnd).toISOString() });
    currentStart = slot;
    currentEnd = end;
  }

  if (currentStart) intervals.push({ start: currentStart, end: new Date(currentEnd).toISOString() });
  return intervals;
}

export function expandIntervals(intervals: TimeInterval[], slots: string[]): Set<string> {
  return new Set(slots.filter((slot) => {
    const start = new Date(slot).getTime();
    const end = start + 30 * 60_000;
    return intervals.some((interval) => new Date(interval.start).getTime() <= start && new Date(interval.end).getTime() >= end);
  }));
}

export function constraintsSummary(constraints: EventConstraints): string {
  const days = constraints.daysOfWeek?.join(", ") ?? constraints.dayPreference ?? "all days";
  const time = constraints.timeOfDay === "custom"
    ? `${constraints.customStart ?? ""}-${constraints.customEnd ?? ""}`
    : constraints.timeOfDay ?? "any time";

  if (constraints.windowType === "next_n_days") return `Next ${constraints.nDays ?? 30} days · ${days} · ${time}`;
  if (constraints.windowType === "specific_month") return `${constraints.month ?? ""}/${constraints.year ?? ""} · ${days} · ${time}`;
  if (constraints.windowType === "after_date") return `After ${constraints.windowStart ?? "selected date"} · ${days} · ${time}`;
  if (constraints.windowType === "date_range") return `${constraints.windowStart ?? "Start"} to ${constraints.windowEnd ?? "End"} · ${days} · ${time}`;
  return `${days} · ${time}`;
}

export function durationLabel(minutes: number): string {
  if (minutes === 30) return "30 min";
  if (minutes === 60) return "1 hr";
  if (minutes === 90) return "1.5 hr";
  if (minutes === 240) return "Half-day";
  if (minutes === 480) return "Full-day";
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`;
}

export function formatSlot(start: string, duration: number): string {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + duration * 60_000);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(startDate);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(startDate);
  const end = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(endDate);
  return `${date}, ${time}-${end}`;
}

export async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Request failed";
}
