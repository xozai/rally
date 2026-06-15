import type { CandidateSlot, EventConstraints } from "./types";

type WindowType = "next_n_days" | "specific_month" | "after_date" | "date_range";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type TimeOfDay = "any" | "morning" | "afternoon" | "evening" | "custom";

type StoredEventConstraints = Omit<EventConstraints, "month" | "timeOfDay"> & {
  windowType?: WindowType;
  windowStart?: string;
  windowEnd?: string;
  nDays?: number;
  month?: string | number;
  year?: number;
  daysOfWeek?: DayOfWeek[];
  timeOfDay?: TimeOfDay;
  customStart?: string;
  customEnd?: string;
  excludeDates?: string[];
};

const dayKeys: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const maxSlots = 500;
const slotIntervalMinutes = 30;

export function generateCandidateSlots(constraints: EventConstraints, durationMinutes: number): string[] {
  const stored = constraints as StoredEventConstraints;
  const { start, end } = resolveWindow(stored);
  const excludedDates = new Set([...(stored.excludedDates ?? []), ...(stored.excludeDates ?? [])].map(toDateKey));
  const allowedDays = resolveAllowedDays(stored);
  const timeWindow = resolveTimeWindow(stored);
  const slots: string[] = [];

  for (let day = startOfUtcDay(start); day.getTime() <= end.getTime() && slots.length < maxSlots; day = addDays(day, 1)) {
    const dateKey = toDateKey(day.toISOString());
    if (excludedDates.has(dateKey)) continue;
    const dayKey = dayKeys[day.getUTCDay()];
    if (!dayKey) continue;
    if (allowedDays && !allowedDays.has(dayKey)) continue;

    const dayStart = withUtcTime(day, timeWindow.start);
    const dayEnd = withUtcTime(day, timeWindow.end);
    const latestStart = new Date(dayEnd.getTime() - durationMinutes * 60_000);

    for (let cursor = dayStart; cursor.getTime() <= latestStart.getTime() && slots.length < maxSlots; cursor = addMinutes(cursor, slotIntervalMinutes)) {
      if (cursor.getTime() >= start.getTime() && cursor.getTime() + durationMinutes * 60_000 <= end.getTime()) {
        slots.push(cursor.toISOString());
      }
    }
  }

  return slots;
}

export function candidateIntervalsFromStarts(starts: string[], durationMinutes: number): CandidateSlot[] {
  return starts.map((start) => ({
    start,
    end: new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString()
  }));
}

function resolveWindow(constraints: StoredEventConstraints): { start: Date; end: Date } {
  const today = startOfUtcDay(new Date());
  const windowType = constraints.windowType;

  if (windowType === "specific_month") {
    const year = constraints.year ?? new Date().getUTCFullYear();
    const month = typeof constraints.month === "number" ? constraints.month - 1 : new Date().getUTCMonth();
    return {
      start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    };
  }

  if (windowType === "after_date") {
    const start = constraints.windowStart ? startOfUtcDay(new Date(constraints.windowStart)) : today;
    return { start, end: endOfUtcDay(addDays(start, constraints.nDays ?? constraints.nextDays ?? 30)) };
  }

  if (windowType === "date_range") {
    const start = constraints.windowStart ? startOfUtcDay(new Date(constraints.windowStart)) : today;
    const end = constraints.windowEnd ? endOfUtcDay(new Date(constraints.windowEnd)) : endOfUtcDay(addDays(start, 30));
    return { start, end };
  }

  if (constraints.afterDate) {
    const start = startOfUtcDay(new Date(constraints.afterDate));
    return { start, end: endOfUtcDay(addDays(start, constraints.nextDays ?? 30)) };
  }

  if (typeof constraints.month === "string" && constraints.month) {
    const parsed = /^\d{4}-\d{2}$/.test(constraints.month) ? constraints.month.split("-") : [];
    const year = parsed[0] ? Number(parsed[0]) : new Date().getUTCFullYear();
    const month = parsed[1] ? Number(parsed[1]) - 1 : new Date().getUTCMonth();
    return {
      start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    };
  }

  return { start: today, end: endOfUtcDay(addDays(today, constraints.nDays ?? constraints.nextDays ?? 30)) };
}

function resolveAllowedDays(constraints: StoredEventConstraints): Set<DayOfWeek> | null {
  if (constraints.daysOfWeek?.length) return new Set(constraints.daysOfWeek);
  if (constraints.dayPreference === "weekdays") return new Set(["mon", "tue", "wed", "thu", "fri"]);
  if (constraints.dayPreference === "weekends") return new Set(["sat", "sun"]);
  return null;
}

function resolveTimeWindow(constraints: StoredEventConstraints): { start: string; end: string } {
  const timeOfDay = constraints.timeOfDay ?? "any";
  if (timeOfDay === "morning") return { start: "08:00", end: "12:00" };
  if (timeOfDay === "afternoon") return { start: "12:00", end: "17:00" };
  if (timeOfDay === "evening") return { start: "17:00", end: "22:00" };
  if (timeOfDay === "custom") return { start: constraints.customStart ?? "09:00", end: constraints.customEnd ?? "17:00" };
  return { start: "08:00", end: "22:00" };
}

function withUtcTime(date: Date, time: string): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), Number(hours), Number(minutes), 0, 0));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function toDateKey(value: string): string {
  return value.slice(0, 10);
}
