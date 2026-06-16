/**
 * Test suite: apps/api/src/routes/participants.ts
 *
 * COVERED:
 *  - GET /api/participants/:token: 404 for unknown token
 *  - GET /api/participants/:token: 200 with serialized participant + event for valid token
 *  - GET /api/participants/:token: returned payload includes event.organizerName
 *  - POST /api/participants/:token/availability: 404 for unknown token
 *  - POST /api/participants/:token/availability: 400 if body lacks `availability` field
 *  - POST /api/participants/:token/availability: 400 if availability items are not datetime strings
 *  - POST /api/participants/:token/availability: 400 if `source` is an invalid enum value
 *  - POST /api/participants/:token/availability: 200 on valid submission
 *  - POST /api/participants/:token/availability: Prisma update is called with responded flag
 *  - POST /api/participants/:token/preferences: 404 for unknown token
 *  - POST /api/participants/:token/preferences: 400 for missing preferences field
 *  - POST /api/participants/:token/preferences: 400 when rating is invalid enum value
 *  - POST /api/participants/:token/preferences: 200 on valid preference submission
 *  - POST /api/participants/:token/vote: 404 for unknown token
 *  - POST /api/participants/:token/vote: 400 for invalid vote value
 *  - POST /api/participants/:token/vote: 404 when suggestion does not belong to participant's event
 *
 * NOT IN SCOPE:
 *  - Authentication (participant routes are token-based, not session-based)
 *  - BullMQ recompute job execution (mocked)
 *  - WebSocket realtime notifications (mocked)
 *  - Integration with scoring/suggestions pipeline
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    participant: {
      findUnique: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn()
    },
    suggestion: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("../../realtime.js", () => ({
  setupRealtime: vi.fn(),
  notifyEventUpdated: vi.fn(),
  notifyParticipantResponded: vi.fn()
}));

vi.mock("../../jobs/queues.js", () => ({
  enqueueRecompute: vi.fn().mockResolvedValue(undefined),
  setupWorker: vi.fn().mockReturnValue(null)
}));

vi.mock("../../lib/resend.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendVotingOpenEmail: vi.fn().mockResolvedValue(undefined),
  sendEventConfirmedEmail: vi.fn().mockResolvedValue(undefined)
}));

// ---------------------------------------------------------------------------
// Set env before importing app
// ---------------------------------------------------------------------------

process.env["DATABASE_URL"] = "postgresql://test:***@localhost:5432/test";
process.env["JWT_SECRET"] = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env["TOKEN_ENCRYPTION_KEY"] = "test-encryption-key-that-is-32ch";
process.env["NODE_ENV"] = "test";

// ---------------------------------------------------------------------------
// App + Prisma handles
// ---------------------------------------------------------------------------

const { buildApp } = await import("../../app.js");
const { prisma } = await import("../../lib/prisma.js");

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: "p_1",
    eventId: "ev_1",
    userId: null,
    email: "guest@example.com",
    name: "Guest",
    token: "tok_valid",
    availability: [],
    preferences: [],
    responded: false,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    event: {
      id: "ev_1",
      title: "Planning Session",
      description: null,
      duration: 60,
      constraints: {},
      status: "OPEN",
      finalSlot: null,
      participants: [{ responded: false }],
      suggestions: [],
      organizer: { name: "Alice", email: "alice@example.com" }
    },
    ...overrides
  };
}

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "sug_1",
    eventId: "ev_1",
    startTime: new Date("2026-08-01T10:00:00Z"),
    endTime: new Date("2026-08-01T11:00:00Z"),
    score: 100,
    breakdown: {},
    rank: 1,
    votes: {},
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// GET /api/participants/:token
// ---------------------------------------------------------------------------

describe("GET /api/participants/:token", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 404 for an unknown token", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/participants/tok_unknown"
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toContain("not found");
  });

  it("returns 200 with participant and event data for a valid token", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(makeParticipant() as never);

    const res = await app.inject({
      method: "GET",
      url: "/api/participants/tok_valid"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ participant: { id: string; event: { title: string } } }>();
    expect(body.participant.id).toBe("p_1");
    expect(body.participant.event.title).toBe("Planning Session");
  });

  it("includes organizerName in the event payload", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(makeParticipant() as never);

    const res = await app.inject({ method: "GET", url: "/api/participants/tok_valid" });
    const body = res.json<{ participant: { event: { organizerName: string } } }>();
    expect(body.participant.event.organizerName).toBe("Alice");
  });

  it("falls back to organizer email when name is null", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(
      makeParticipant({ event: { ...makeParticipant().event, organizer: { name: null, email: "noname@example.com" } } }) as never
    );

    const res = await app.inject({ method: "GET", url: "/api/participants/tok_valid" });
    const body = res.json<{ participant: { event: { organizerName: string } } }>();
    expect(body.participant.event.organizerName).toBe("noname@example.com");
  });

  it("returns responseCount based on responded participants", async () => {
    const participant = makeParticipant({
      event: {
        ...makeParticipant().event,
        participants: [{ responded: true }, { responded: false }, { responded: true }]
      }
    });
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);

    const res = await app.inject({ method: "GET", url: "/api/participants/tok_valid" });
    const body = res.json<{ participant: { event: { responseCount: number; participantCount: number } } }>();
    expect(body.participant.event.responseCount).toBe(2);
    expect(body.participant.event.participantCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// POST /api/participants/:token/availability
// ---------------------------------------------------------------------------

describe("POST /api/participants/:token/availability", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const validAvailability = {
    availability: [
      { start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T11:00:00.000Z" }
    ],
    source: "manual"
  };

  it("returns 404 when token is unknown", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_bad/availability",
      body: validAvailability
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when availability field is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: { source: "manual" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when availability items have non-datetime strings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: {
        availability: [{ start: "not-a-date", end: "also-not" }],
        source: "manual"
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when source is an invalid enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: {
        availability: [{ start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T10:00:00.000Z" }],
        source: "carrier_pigeon"
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 on a valid submission", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.participant.update).mockResolvedValueOnce({ ...participant, responded: false } as never);
    vi.mocked(prisma.participant.groupBy).mockResolvedValueOnce([] as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: validAvailability
    });
    expect(res.statusCode).toBe(200);
  });

  it("calls prisma.participant.update with the provided availability array", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.participant.update).mockResolvedValueOnce({ ...participant, responded: false } as never);
    vi.mocked(prisma.participant.groupBy).mockResolvedValueOnce([] as never);

    await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: validAvailability
    });

    const updateCall = vi.mocked(prisma.participant.update).mock.calls[0]?.[0];
    expect(updateCall?.data.availability).toEqual(validAvailability.availability);
  });

  it("accepts google as a valid source", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.participant.update).mockResolvedValueOnce({ ...participant, responded: false } as never);
    vi.mocked(prisma.participant.groupBy).mockResolvedValueOnce([] as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/availability",
      body: { ...validAvailability, source: "google" }
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/participants/:token/preferences
// ---------------------------------------------------------------------------

describe("POST /api/participants/:token/preferences", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const validPreferences = {
    preferences: [
      {
        start: "2026-08-01T09:00:00.000Z",
        end: "2026-08-01T10:00:00.000Z",
        rating: "preferred"
      }
    ]
  };

  it("returns 404 when token is unknown", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_bad/preferences",
      body: validPreferences
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when preferences field is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/preferences",
      body: {}
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when rating is an invalid enum value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/preferences",
      body: {
        preferences: [
          {
            start: "2026-08-01T09:00:00.000Z",
            end: "2026-08-01T10:00:00.000Z",
            rating: "maybe" // invalid — must be preferred | available | rather_not
          }
        ]
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when start/end are not valid ISO datetimes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/preferences",
      body: {
        preferences: [
          { start: "bad", end: "also-bad", rating: "preferred" }
        ]
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 on a valid preference submission", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.participant.update).mockResolvedValueOnce({ ...participant, responded: false } as never);
    vi.mocked(prisma.participant.groupBy).mockResolvedValueOnce([] as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/preferences",
      body: validPreferences
    });
    expect(res.statusCode).toBe(200);
  });

  it("accepts all valid rating values: preferred, available, rather_not", async () => {
    for (const rating of ["preferred", "available", "rather_not"]) {
      vi.clearAllMocks();
      const participant = makeParticipant();
      vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
      vi.mocked(prisma.participant.update).mockResolvedValueOnce({ ...participant, responded: false } as never);
      vi.mocked(prisma.participant.groupBy).mockResolvedValueOnce([] as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/participants/tok_valid/preferences",
        body: {
          preferences: [
            { start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T10:00:00.000Z", rating }
          ]
        }
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/participants/:token/vote
// ---------------------------------------------------------------------------

describe("POST /api/participants/:token/vote", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 404 for unknown token", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_bad/vote",
      body: { suggestionId: "sug_1", vote: "yes" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid vote value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/vote",
      body: { suggestionId: "sug_1", vote: "absolutely" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when suggestion belongs to a different event", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.suggestion.findUnique).mockResolvedValueOnce(
      makeSuggestion({ eventId: "ev_other" }) as never
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/vote",
      body: { suggestionId: "sug_1", vote: "yes" }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toContain("not found");
  });

  it("returns 404 when suggestion does not exist", async () => {
    const participant = makeParticipant();
    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.suggestion.findUnique).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/vote",
      body: { suggestionId: "sug_no_exist", vote: "no" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 and records the vote for a valid submission", async () => {
    const participant = makeParticipant();
    const suggestion = makeSuggestion();
    const updatedSuggestion = { ...suggestion, votes: { p_1: "yes" } };

    vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.suggestion.findUnique).mockResolvedValueOnce(suggestion as never);
    vi.mocked(prisma.suggestion.update).mockResolvedValueOnce(updatedSuggestion as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/participants/tok_valid/vote",
      body: { suggestionId: "sug_1", vote: "yes" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ suggestion: { votes: Record<string, string> } }>();
    expect(body.suggestion.votes["p_1"]).toBe("yes");
  });

  it("accepts all valid vote values: yes, no, maybe", async () => {
    for (const vote of ["yes", "no", "maybe"]) {
      vi.clearAllMocks();
      const participant = makeParticipant();
      const suggestion = makeSuggestion();
      vi.mocked(prisma.participant.findUnique).mockResolvedValueOnce(participant as never);
      vi.mocked(prisma.suggestion.findUnique).mockResolvedValueOnce(suggestion as never);
      vi.mocked(prisma.suggestion.update).mockResolvedValueOnce({
        ...suggestion,
        votes: { p_1: vote }
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/participants/tok_valid/vote",
        body: { suggestionId: "sug_1", vote }
      });
      expect(res.statusCode).toBe(200);
    }
  });
});
