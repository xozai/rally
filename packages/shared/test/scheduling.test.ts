import { describe, expect, it } from "vitest";
import { rankSuggestions } from "../src/scheduling";

describe("rankSuggestions", () => {
  it("ranks slots by free participants and stated preferences", () => {
    const suggestions = rankSuggestions(
      [
        { start: "2026-07-01T23:00:00.000Z", end: "2026-07-02T00:00:00.000Z" },
        { start: "2026-07-02T23:00:00.000Z", end: "2026-07-03T00:00:00.000Z" }
      ],
      [
        {
          id: "a",
          availability: [{ start: "2026-07-01T22:00:00.000Z", end: "2026-07-02T01:00:00.000Z" }],
          preferences: [{ start: "2026-07-01T23:00:00.000Z", end: "2026-07-02T00:00:00.000Z", rating: "preferred" }]
        },
        {
          id: "b",
          availability: [
            { start: "2026-07-01T22:00:00.000Z", end: "2026-07-02T01:00:00.000Z" },
            { start: "2026-07-02T22:00:00.000Z", end: "2026-07-03T01:00:00.000Z" }
          ],
          preferences: [{ start: "2026-07-02T23:00:00.000Z", end: "2026-07-03T00:00:00.000Z", rating: "rather_not" }]
        }
      ],
      { eventId: "event_1", now: new Date("2026-06-30T00:00:00.000Z") }
    );

    expect(suggestions[0]?.startTime).toBe("2026-07-01T23:00:00.000Z");
    expect(suggestions[0]?.breakdown.preferred).toEqual(["a"]);
    expect(suggestions[0]?.breakdown.free).toEqual(["a", "b"]);
  });

  it("applies blackout penalties and asap recency bonus", () => {
    const suggestions = rankSuggestions(
      [
        { start: "2026-07-01T18:00:00.000Z", end: "2026-07-01T19:00:00.000Z" },
        { start: "2026-07-20T18:00:00.000Z", end: "2026-07-20T19:00:00.000Z" }
      ],
      [
        {
          id: "a",
          availability: [
            { start: "2026-07-01T18:00:00.000Z", end: "2026-07-01T19:00:00.000Z" },
            { start: "2026-07-20T18:00:00.000Z", end: "2026-07-20T19:00:00.000Z" }
          ],
          preferences: [],
          blackouts: [{ start: "2026-07-01T19:30:00.000Z", end: "2026-07-01T20:30:00.000Z" }]
        }
      ],
      { eventId: "event_1", asap: true, now: new Date("2026-07-01T00:00:00.000Z") }
    );

    expect(suggestions[0]?.startTime).toBe("2026-07-01T18:00:00.000Z");
    expect(suggestions[0]?.breakdown.penalties).toHaveLength(1);
  });
});
