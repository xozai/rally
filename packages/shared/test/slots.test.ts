/**
 * Test suite: packages/shared/src/slots.ts — generateCandidateSlots
 *
 * COVERED:
 *  - Empty / inverted date range produces zero slots
 *  - Single-day date_range returns slots only for that day
 *  - weekends dayPreference constrains output to Sat/Sun only
 *  - weekdays dayPreference constrains output to Mon–Fri only
 *  - specific_month windowType returns slots only within that month
 *  - excludedDates removes individual days
 *  - excludeDates (StoredEventConstraints alias) also removes days
 *  - Duration that exceeds the time window produces zero slots
 *  - Morning / afternoon / evening timeOfDay filters restrict hours
 *  - Custom timeOfDay uses customStart/customEnd
 *  - daysOfWeek explicit array overrides dayPreference
 *  - after_date windowType advances start correctly
 *  - All returned ISO strings are parseable and slots are ordered
 *  - Slot count never exceeds the internal 500-slot cap
 *  - candidateIntervalsFromStarts builds correct end-times
 *
 * NOT IN SCOPE:
 *  - asap flag — generateCandidateSlots ignores EventConstraints.asap entirely
 *    (asap logic lives in rankSuggestions in scheduling.ts)
 *  - Prisma / DB interactions — pure function, no I/O
 *  - Timezone-aware scheduling (all logic is UTC)
 */

import { describe, expect, it } from "vitest";
import { candidateIntervalsFromStarts, generateCandidateSlots } from "../src/slots";
import type { EventConstraints } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast extended StoredEventConstraints fields onto EventConstraints. */
function constraints(
  overrides: Partial<EventConstraints> & Record<string, unknown> = {}
): EventConstraints {
  return {
    dayPreference: "any",
    timeOfDay: "any",
    preferredSlots: [],
    excludedDates: [],
    ...overrides,
  } as EventConstraints;
}

function dayOfWeek(iso: string): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(iso).getUTCDay()]!;
}

// ---------------------------------------------------------------------------
// Empty / inverted date ranges
// ---------------------------------------------------------------------------

describe("empty / inverted date range", () => {
  it("returns [] when windowEnd is before windowStart", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-05",
        windowEnd: "2026-07-01",
      }),
      60
    );
    expect(slots).toHaveLength(0);
  });

  it("returns [] when windowStart equals windowEnd but duration exceeds window", () => {
    // Same-day range: 08:00–22:00 available (14 h). Duration 15 h → 900 min > 840 min
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-01",
      }),
      901 // 15 h 1 min
    );
    expect(slots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Single-day range
// ---------------------------------------------------------------------------

describe("single-day date_range", () => {
  it("all returned slots fall within the specified day", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-15",
        windowEnd: "2026-07-15",
      }),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startsWith("2026-07-15")).toBe(true);
    }
  });

  it("generates slots every 30 minutes between 08:00 and 21:00 (60-min duration, any timeOfDay)", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-08-01",
        windowEnd: "2026-08-01",
      }),
      60
    );
    // 08:00 → 21:00 at 30-min steps = 27 start times (26 half-hour gaps between them)
    expect(slots).toHaveLength(27);
    expect(slots[0]).toBe("2026-08-01T08:00:00.000Z");
    expect(slots[slots.length - 1]).toBe("2026-08-01T21:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// dayPreference filtering
// ---------------------------------------------------------------------------

describe("dayPreference: weekends", () => {
  it("all returned slots are on Saturday or Sunday", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01", // Wednesday
        windowEnd: "2026-07-12",   // Sunday
        dayPreference: "weekends",
      }),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const dow = dayOfWeek(s);
      expect(["sat", "sun"]).toContain(dow);
    }
  });

  it("returns [] for a weekday-only date range with weekends constraint", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-06", // Monday
        windowEnd: "2026-07-10",   // Friday
        dayPreference: "weekends",
      }),
      60
    );
    expect(slots).toHaveLength(0);
  });
});

describe("dayPreference: weekdays", () => {
  it("all returned slots are Mon–Fri", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01", // Wed
        windowEnd: "2026-07-12",
        dayPreference: "weekdays",
      }),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const dow = dayOfWeek(s);
      expect(["mon", "tue", "wed", "thu", "fri"]).toContain(dow);
    }
  });
});

// ---------------------------------------------------------------------------
// daysOfWeek explicit override
// ---------------------------------------------------------------------------

describe("daysOfWeek explicit array", () => {
  it("restricts to only the specified days regardless of dayPreference", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-06", // Mon
        windowEnd: "2026-07-12",   // Sun
        dayPreference: "any",
        daysOfWeek: ["tue", "thu"],
      } as Record<string, unknown>),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const dow = dayOfWeek(s);
      expect(["tue", "thu"]).toContain(dow);
    }
  });
});

// ---------------------------------------------------------------------------
// specific_month windowType
// ---------------------------------------------------------------------------

describe("windowType: specific_month", () => {
  it("generates slots only within March 2026", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "specific_month",
        month: 3,
        year: 2026,
      } as Record<string, unknown>),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startsWith("2026-03-")).toBe(true);
    }
  });

  it("respects the last day of the month (no overflow into next month)", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "specific_month",
        month: 2,   // February
        year: 2026, // not a leap year
      } as Record<string, unknown>),
      60
    );
    for (const s of slots) {
      expect(s.startsWith("2026-02-")).toBe(true);
      const day = parseInt(s.slice(8, 10), 10);
      expect(day).toBeLessThanOrEqual(28);
    }
  });
});

// ---------------------------------------------------------------------------
// excludedDates / excludeDates
// ---------------------------------------------------------------------------

describe("excludedDates filtering", () => {
  it("omits the excluded date from EventConstraints.excludedDates", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-03",
        excludedDates: ["2026-07-02"],
      }),
      60
    );
    for (const s of slots) {
      expect(s.startsWith("2026-07-02")).toBe(false);
    }
    // Should still have slots on the other two days
    const hasDay1 = slots.some((s) => s.startsWith("2026-07-01"));
    const hasDay3 = slots.some((s) => s.startsWith("2026-07-03"));
    expect(hasDay1).toBe(true);
    expect(hasDay3).toBe(true);
  });

  it("omits the excluded date from StoredEventConstraints.excludeDates alias", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-03",
        excludeDates: ["2026-07-02"],
      } as Record<string, unknown>),
      60
    );
    for (const s of slots) {
      expect(s.startsWith("2026-07-02")).toBe(false);
    }
  });

  it("handles excluding all days in range → returns []", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-01",
        excludedDates: ["2026-07-01"],
      }),
      60
    );
    expect(slots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duration overlapping / exceeding time window
// ---------------------------------------------------------------------------

describe("duration vs time window overlap", () => {
  it("returns [] when duration equals the morning window (exactly 240 min = 4 h, no latestStart)", () => {
    // morning = 08:00–12:00, duration 241 min > 240 min → latestStart before dayStart
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-07",
        windowEnd: "2026-07-07",
        timeOfDay: "morning",
      } as Record<string, unknown>),
      241
    );
    expect(slots).toHaveLength(0);
  });

  it("returns exactly one slot when duration fills the afternoon window exactly (300 min = 5 h)", () => {
    // afternoon = 12:00–17:00, duration 300 min → latestStart = 12:00 → only 12:00 slot
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-07",
        windowEnd: "2026-07-07",
        timeOfDay: "afternoon",
      } as Record<string, unknown>),
      300
    );
    // One slot at 12:00
    expect(slots).toHaveLength(1);
    expect(slots[0]).toContain("T12:00:00");
  });

  it("returns [] when duration exceeds the entire 08:00–22:00 window (841 min)", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-07",
        windowEnd: "2026-07-07",
      }),
      841
    );
    expect(slots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// timeOfDay filtering
// ---------------------------------------------------------------------------

describe("timeOfDay filtering", () => {
  it("morning slots are all between 08:00 and 12:00 UTC", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-14",
        windowEnd: "2026-07-14",
        timeOfDay: "morning",
      } as Record<string, unknown>),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const hour = new Date(s).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThan(12);
    }
  });

  it("afternoon slots are all between 12:00 and 17:00 UTC", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-14",
        windowEnd: "2026-07-14",
        timeOfDay: "afternoon",
      } as Record<string, unknown>),
      60
    );
    for (const s of slots) {
      const hour = new Date(s).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(12);
      expect(hour).toBeLessThan(17);
    }
  });

  it("evening slots are all between 17:00 and 22:00 UTC", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-14",
        windowEnd: "2026-07-14",
        timeOfDay: "evening",
      } as Record<string, unknown>),
      60
    );
    for (const s of slots) {
      const hour = new Date(s).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(17);
      expect(hour).toBeLessThan(22);
    }
  });

  it("custom timeOfDay uses customStart and customEnd", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-14",
        windowEnd: "2026-07-14",
        timeOfDay: "custom",
        customStart: "10:00",
        customEnd: "13:00",
      } as Record<string, unknown>),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const hour = new Date(s).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThan(13);
    }
  });
});

// ---------------------------------------------------------------------------
// after_date windowType
// ---------------------------------------------------------------------------

describe("windowType: after_date", () => {
  it("starts slots from windowStart date, spanning nDays forward", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "after_date",
        windowStart: "2026-09-01",
        nDays: 2,
      } as Record<string, unknown>),
      60
    );
    expect(slots.length).toBeGreaterThan(0);
    // All slots should be on 2026-09-01 or 2026-09-02
    for (const s of slots) {
      expect(s >= "2026-09-01T00:00:00.000Z").toBe(true);
      expect(s < "2026-09-04T00:00:00.000Z").toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Slot ordering and parseability
// ---------------------------------------------------------------------------

describe("slot ordering and format", () => {
  it("returned slots are in ascending chronological order", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-05",
      }),
      60
    );
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]! >= slots[i - 1]!).toBe(true);
    }
  });

  it("all returned strings are valid ISO-8601 dates", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-02",
      }),
      60
    );
    for (const s of slots) {
      expect(Number.isNaN(Date.parse(s))).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Slot cap (500)
// ---------------------------------------------------------------------------

describe("500-slot cap", () => {
  it("never returns more than 500 slots even with a wide range", () => {
    const slots = generateCandidateSlots(
      constraints({
        windowType: "date_range",
        windowStart: "2026-01-01",
        windowEnd: "2026-12-31",
      }),
      30
    );
    expect(slots.length).toBeLessThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// candidateIntervalsFromStarts
// ---------------------------------------------------------------------------

describe("candidateIntervalsFromStarts", () => {
  it("maps ISO start strings to { start, end } with correct end offset", () => {
    const starts = ["2026-07-01T10:00:00.000Z", "2026-07-01T10:30:00.000Z"];
    const intervals = candidateIntervalsFromStarts(starts, 60);
    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toEqual({
      start: "2026-07-01T10:00:00.000Z",
      end: "2026-07-01T11:00:00.000Z",
    });
    expect(intervals[1]).toEqual({
      start: "2026-07-01T10:30:00.000Z",
      end: "2026-07-01T11:30:00.000Z",
    });
  });

  it("returns empty array for empty input", () => {
    expect(candidateIntervalsFromStarts([], 60)).toEqual([]);
  });

  it("handles fractional durations correctly", () => {
    const intervals = candidateIntervalsFromStarts(["2026-07-01T09:00:00.000Z"], 90);
    expect(intervals[0]!.end).toBe("2026-07-01T10:30:00.000Z");
  });
});
