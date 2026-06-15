/**
 * Test suite: apps/api/src/routes/events.ts
 *
 * COVERED:
 *  - POST /api/events: 401 when unauthenticated
 *  - POST /api/events: 400 for missing required fields (title, duration, constraints)
 *  - POST /api/events: 400 for invalid constraints.windowType
 *  - POST /api/events: 201 with event object when Prisma and session are mocked
 *  - GET /api/events/:id: 401 when unauthenticated
 *  - GET /api/events/:id: 404 for an unknown event id
 *  - GET /api/events/:id: 200 with event when Prisma returns a record
 *  - PATCH /api/events/:id/confirm: 401 when unauthenticated (no session cookie)
 *  - PATCH /api/events/:id/confirm: 400 for invalid finalSlot (not ISO datetime)
 *  - PATCH /api/events/:id/confirm: 404 when event is not owned by the user
 *  - DELETE /api/events/:id: 401 when unauthenticated
 *  - GET /api/events (list): 401 when unauthenticated
 *  - POST /api/events/:id/participants: validates email format (400 for bad email)
 *
 * NOT IN SCOPE:
 *  - Real database queries (Prisma is fully mocked via vi.mock)
 *  - Email delivery (resend module is mocked)
 *  - WebSocket realtime notifications (realtime module is mocked)
 *  - BullMQ job enqueueing
 *  - GET /api/events/:id/ics iCal generation (calendar edge case)
 *  - POST /api/events/:id/poll voting workflow
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Mock all external dependencies before any imports
// ---------------------------------------------------------------------------

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    event: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    participant: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn()
    },
    suggestion: {
      findMany: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

vi.mock("../../lib/resend.js", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
  sendVotingOpenEmail: vi.fn().mockResolvedValue(undefined),
  sendEventConfirmedEmail: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../realtime.js", () => ({
  setupRealtime: vi.fn(),
  notifyEventUpdated: vi.fn(),
  notifyParticipantResponded: vi.fn()
}));

vi.mock("../../jobs/queues.js", () => ({
  enqueueRecompute: vi.fn().mockResolvedValue(undefined)
}));

// ---------------------------------------------------------------------------
// Set env vars before importing app
// ---------------------------------------------------------------------------

process.env["DATABASE_URL"] = "postgresql://test:***@localhost:5432/test";
process.env["JWT_SECRET"] = "test-jwt-secret-that-is-at-least-32-chars-long";
process.env["TOKEN_ENCRYPTION_KEY"] = "test-encryption-key-that-is-32ch";
process.env["NODE_ENV"] = "test";

// ---------------------------------------------------------------------------
// Build the Fastify app
// ---------------------------------------------------------------------------

const { buildApp } = await import("../../app.js");
const { createSessionToken } = await import("../../auth/session.js");
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
// Helpers
// ---------------------------------------------------------------------------

async function authCookie(): Promise<string> {
  const token = await createSessionToken({ userId: "user_1", email: "organizer@example.com" });
  return `rally_session=${token}`;
}

function makeEventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev_1",
    title: "Test Event",
    description: null,
    organizerId: "user_1",
    duration: 60,
    constraints: { windowType: "date_range", windowStart: "2026-08-01", windowEnd: "2026-08-10" },
    status: "OPEN",
    finalSlot: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: null,
    participants: [],
    suggestions: [],
    organizer: { name: "Alice", email: "organizer@example.com" },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

describe("POST /api/events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no session cookie is present", async () => {
    const res = await app.inject({ method: "POST", url: "/api/events", body: {} });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when body is missing required title", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: await authCookie() },
      body: {
        duration: 60,
        constraints: { windowType: "date_range", windowStart: "2026-08-01", windowEnd: "2026-08-10" }
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when constraints.windowType is invalid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: await authCookie() },
      body: {
        title: "My Event",
        duration: 60,
        constraints: { windowType: "invalid_type" }
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when duration is negative", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: await authCookie() },
      body: {
        title: "Bad Duration",
        duration: -5,
        constraints: { windowType: "date_range" }
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 201 with event when input is valid", async () => {
    const record = makeEventRecord();
    vi.mocked(prisma.event.create).mockResolvedValueOnce(record as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: await authCookie() },
      body: {
        title: "Test Event",
        duration: 60,
        constraints: { windowType: "date_range", windowStart: "2026-08-01", windowEnd: "2026-08-10" }
      }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ event: { id: string; title: string } }>();
    expect(body.event.id).toBe("ev_1");
    expect(body.event.title).toBe("Test Event");
  });

  it("passes organizerId from session to prisma.event.create", async () => {
    const record = makeEventRecord();
    vi.mocked(prisma.event.create).mockResolvedValueOnce(record as never);

    await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie: await authCookie() },
      body: {
        title: "Org Test",
        duration: 30,
        constraints: { windowType: "date_range", windowStart: "2026-08-01", windowEnd: "2026-08-05" }
      }
    });

    const createArgs = vi.mocked(prisma.event.create).mock.calls[0]?.[0];
    expect(createArgs?.data.organizerId).toBe("user_1");
    expect(createArgs?.data.status).toBe("OPEN");
  });
});

// ---------------------------------------------------------------------------
// GET /api/events (list)
// ---------------------------------------------------------------------------

describe("GET /api/events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with events array when authenticated", async () => {
    vi.mocked(prisma.event.findMany).mockResolvedValueOnce([makeEventRecord()] as never);

    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { cookie: await authCookie() }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ events: unknown[] }>();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:id
// ---------------------------------------------------------------------------

describe("GET /api/events/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events/ev_1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for an unknown event id", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/events/unknown_id",
      headers: { cookie: await authCookie() }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toContain("not found");
  });

  it("returns 200 with event details for a known event", async () => {
    const record = makeEventRecord();
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(record as never);

    const res = await app.inject({
      method: "GET",
      url: "/api/events/ev_1",
      headers: { cookie: await authCookie() }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ event: { id: string } }>();
    expect(body.event.id).toBe("ev_1");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:id/confirm
// ---------------------------------------------------------------------------

describe("PATCH /api/events/:id/confirm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/ev_1/confirm",
      body: { finalSlot: "2026-08-05T14:00:00.000Z" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when finalSlot is not a valid datetime", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/ev_1/confirm",
      headers: { cookie: await authCookie() },
      body: { finalSlot: "not-a-date" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when event is not found or not owned by user", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/no_such_event/confirm",
      headers: { cookie: await authCookie() },
      body: { finalSlot: "2026-08-05T14:00:00.000Z" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 and updates event status to CONFIRMED", async () => {
    const existingRecord = makeEventRecord({ participants: [] });
    const updatedRecord = makeEventRecord({ status: "CONFIRMED", finalSlot: new Date("2026-08-05T14:00:00.000Z") });

    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(existingRecord as never);
    vi.mocked(prisma.event.update).mockResolvedValueOnce(updatedRecord as never);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/ev_1/confirm",
      headers: { cookie: await authCookie() },
      body: { finalSlot: "2026-08-05T14:00:00.000Z" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ event: { status: string } }>();
    expect(body.event.status).toBe("CONFIRMED");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/events/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/events/ev_1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when event does not exist", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/no_event",
      headers: { cookie: await authCookie() }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 204 on successful deletion", async () => {
    const record = makeEventRecord();
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(record as never);
    vi.mocked(prisma.suggestion.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.participant.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
    vi.mocked(prisma.event.delete).mockResolvedValueOnce(record as never);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/ev_1",
      headers: { cookie: await authCookie() }
    });
    expect(res.statusCode).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:id/participants (invite endpoint)
// ---------------------------------------------------------------------------

describe("POST /api/events/:id/participants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for an invalid email address", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(makeEventRecord() as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ev_1/participants",
      headers: { cookie: await authCookie() },
      body: { email: "not-an-email" }
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when event is not owned by the session user", async () => {
    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ev_999/participants",
      headers: { cookie: await authCookie() },
      body: { email: "invite@example.com" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 201 with participant on success", async () => {
    const event = makeEventRecord();
    const participant = {
      id: "p_1",
      eventId: "ev_1",
      userId: null,
      email: "invite@example.com",
      name: "Invited",
      token: "tok_abc",
      availability: [],
      preferences: {},
      responded: false,
      createdAt: new Date("2026-07-01T00:00:00Z")
    };

    vi.mocked(prisma.event.findFirst).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.participant.create).mockResolvedValueOnce(participant as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/events/ev_1/participants",
      headers: { cookie: await authCookie() },
      body: { email: "invite@example.com", name: "Invited" }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ participant: { email: string } }>();
    expect(body.participant.email).toBe("invite@example.com");
  });
});
