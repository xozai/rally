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
    organizerName: string;
  };
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
  const stored = constraints as Omit<EventConstraints, "month" | "timeOfDay"> & {
    windowType?: string;
    windowStart?: string;
    windowEnd?: string;
    nDays?: number;
    month?: string | number;
    year?: number;
    daysOfWeek?: string[];
    timeOfDay?: string;
    customStart?: string;
    customEnd?: string;
  };
  const days = stored.daysOfWeek?.join(", ") ?? stored.dayPreference ?? "all days";
  const time = stored.timeOfDay === "custom"
    ? `${stored.customStart ?? ""}-${stored.customEnd ?? ""}`
    : stored.timeOfDay ?? "any time";

  if (stored.windowType === "next_n_days") return `Next ${stored.nDays ?? 30} days · ${days} · ${time}`;
  if (stored.windowType === "specific_month") return `${stored.month ?? ""}/${stored.year ?? ""} · ${days} · ${time}`;
  if (stored.windowType === "after_date") return `After ${stored.windowStart ?? "selected date"} · ${days} · ${time}`;
  if (stored.windowType === "date_range") return `${stored.windowStart ?? "Start"} to ${stored.windowEnd ?? "End"} · ${days} · ${time}`;
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
