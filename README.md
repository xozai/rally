# Rally

> **Find the perfect time to meet, together.**

![CI](https://github.com/xozai/rally/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Rally is a social scheduling platform that eliminates the back-and-forth of finding a meeting time. Participants submit their availability and time preferences through a magic-link invite — no account required — and Rally's scoring engine surfaces the best time slots automatically.

---

## Features

- **Magic-link authentication** — passwordless sign-in via email; no passwords to manage
- **Guest mode** — participants join and submit availability via a unique invite link without creating an account
- **Google Calendar OAuth** — import busy blocks directly from Google Calendar (read-only, offline access)
- **Outlook / Microsoft Calendar OAuth** — import busy blocks from Microsoft 365 / Outlook Calendar
- **Manual availability grid** — drag-select free slots on an interactive time grid when no calendar is connected
- **Preference scoring engine** — weighted algorithm scores every candidate slot across `preferred`, `available`, and `rather_not` ratings
- **Real-time WebSocket updates** — response counts and event status sync instantly across all open tabs via Server-Sent Events / WebSocket
- **Voting poll** — organizer promotes top-ranked slots to a participant vote (`yes` / `no` / `maybe`) before confirming
- **RSVP** — participants record a final RSVP (`attending` / `declined` / `maybe`) on the confirmed event
- **`.ics` export** — download a standards-compliant calendar file for any confirmed Rally (protected by signed token)
- **Timezone support** — all times stored in UTC; constraints and availability grid respect each user's local timezone
- **Branded transactional email** — invite, voting-open, and event-confirmed emails sent via Resend
- **Email delivery tracking** — per-participant Sent / Opened / Clicked status badge on the event detail page, powered by Resend webhooks
- **Public event status page** — shareable `/events/:id/status` link showing response progress and an anonymized availability heatmap; no auth required
- **Invite token expiry** — participant invite links expire after 30 days; organizer can rotate and resend at any time
- **Event expiry** — events automatically expire after a configurable deadline; expired events return `410 Gone`
- **GDPR right-to-erasure** — participants can permanently delete their availability and personal data via a single API call
- **Mobile-responsive UI** — Tailwind-based layout works on phones, tablets, and desktops
- **Robust error handling** — global error boundaries in Next.js, structured Fastify error responses, Zod input validation throughout

---

## Architecture

### System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          User's Browser                          │
│              Next.js 14 (React Server Components)                │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS / WebSocket
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Vercel  (apps/web — Next.js 14)                  │
│   Pages: /, /dashboard, /events/new, /events/:id,               │
│          /events/:id/status,                                     │
│          /join/:token, /join/:token/availability,                │
│          /join/:token/preferences, /join/:token/vote             │
└────────────────────────────┬─────────────────────────────────────┘
                             │  REST + Server-Sent Events
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│               Railway  (apps/api — Fastify 4)                    │
│   Auth · Events · Participants · Calendar · Suggestions          │
│   Webhooks (Resend)                                              │
└────┬─────────────────┬──────────────────┬────────────────────────┘
     │                 │                  │
     ▼                 ▼                  ▼
┌─────────┐    ┌──────────────┐   ┌─────────────┐
│Supabase │    │   Upstash    │   │   Resend    │
│Postgres │    │    Redis     │   │   (Email +  │
│(Prisma) │    │(Queues/Rate) │   │   Webhooks) │
└─────────┘    └──────────────┘   └─────────────┘
                                         │
                     ┌───────────────────┴──────────────┐
                     │  External OAuth Providers         │
                     │  Google Calendar · Microsoft 365  │
                     └──────────────────────────────────┘
```

### Tech Stack

**Frontend**
- Technology: Next.js 14 (App Router, React Server Components)
- Purpose: Server-rendered UI, routing, auth callbacks

**Backend**
- Technology: Fastify 4 (TypeScript)
- Purpose: REST API, WebSocket events, OAuth flows, Resend webhook receiver

**Database**
- Technology: PostgreSQL via Supabase + Prisma ORM
- Purpose: Events, participants, suggestions, users

**Cache / Queue**
- Technology: Upstash Redis
- Purpose: Background job queue, per-email magic-link rate limiting, session JTI tracking

**Email**
- Technology: Resend
- Purpose: Magic-link sign-in, invite, voting-open, and confirmation emails; open/click tracking webhooks

**Shared types**
- Technology: `@rally/shared` (packages/shared)
- Purpose: TypeScript interfaces shared between API and web

**Build system**
- Technology: Turborepo + npm workspaces
- Purpose: Monorepo task orchestration, caching

### Data Flow

1. **Organizer** signs in via magic link → session cookie set by Fastify, redirect to `/dashboard`
2. **Create event** — organizer submits title, duration, and scheduling constraints (`POST /api/events`)
3. **Invite participants** — organizer adds emails; API sends branded invite email via Resend with a unique `token` link, captures the Resend message ID, and stores it on the participant record (`POST /api/events/:id/participants`)
4. **Participant joins** — clicks magic link → `/join/:token`; optionally connects Google / Outlook Calendar to import busy blocks. Invite link expires after 30 days.
5. **Submit availability** — participant drags slots on the grid or imports from calendar (`POST /api/participants/:token/availability`)
6. **Set preferences** — participant rates each slot `preferred` / `available` / `rather_not` (`POST /api/participants/:token/preferences`)
7. **Scoring** — each submission enqueues a Redis job; the worker re-scores all candidate slots and writes ranked `Suggestion` rows
8. **Real-time sync** — WebSocket/SSE pushes response count and suggestion updates to all open organizer tabs
9. **Email tracking** — Resend fires `email.opened` / `email.clicked` webhook events to `POST /api/webhooks/resend`; participant `emailStatus` is upgraded (Sent → Opened → Clicked) and shown as a badge on the event detail page
10. **Voting poll** (optional) — organizer promotes top suggestions to a vote; participants receive email and vote `yes` / `no` / `maybe`
11. **Confirm** — organizer picks final slot (`PATCH /api/events/:id/confirm`); API sends confirmation email with signed `.ics` download link to all participants
12. **Download .ics** — attendees download the calendar invite (`GET /api/events/:id/ics?token=...`)
13. **Share progress** — organizer shares `/events/:id/status` — a public page showing response count and anonymized heatmap, no auth required

### Project Structure

```
rally/
├── apps/
│   ├── api/                        # Fastify REST API
│   │   └── src/
│   │       ├── routes/             # Route handlers (auth, events, participants, calendar, suggestions, webhooks)
│   │       ├── auth/               # Session management, magic-link tokens, require-user guard
│   │       ├── jobs/               # Redis queue workers (suggestion recompute)
│   │       ├── lib/                # Prisma client, Redis client, Resend helpers, crypto utils, Zod schemas
│   │       ├── realtime.ts         # WebSocket / SSE broadcaster
│   │       └── env.ts              # Zod-validated environment schema
│   └── web/                        # Next.js 14 web app
│       ├── app/
│       │   ├── page.tsx            # Marketing landing page
│       │   ├── dashboard/          # Organizer event list
│       │   ├── events/
│       │   │   ├── new/            # Create event wizard
│       │   │   └── [id]/
│       │   │       ├── page.tsx    # Event detail, confirm, error boundary
│       │   │       └── status/     # Public shareable status page (no auth)
│       │   ├── join/[token]/       # Participant flow: join → availability → preferences → vote → done
│       │   ├── login/              # Magic-link login form
│       │   └── layout.tsx          # Root layout, providers
│       ├── components/
│       │   ├── AvailabilityGrid.tsx # Interactive drag-to-select time grid
│       │   ├── StatusBadge.tsx     # Shared event status badge component
│       │   └── ui/                 # Headless UI primitives (Button, Card, Badge, …)
│       └── lib/
│           └── utils.ts            # Shared helpers (readError, websocketBaseUrl, parseRealtimeMessage, …)
├── packages/
│   └── shared/                     # Shared TypeScript types and slot utilities
│       └── src/
│           ├── types.ts            # RallyEvent, Participant, Suggestion, EventConstraints, …
│           └── slots.ts            # Candidate slot generation and scoring helpers
├── .env.example                    # All required environment variables
├── DEPLOYMENT.md                   # Step-by-step production deployment guide
├── CONTRIBUTING.md                 # Contribution guidelines
└── turbo.json                      # Turborepo pipeline configuration
```

---

## Getting Started (Local Dev)

### Prerequisites

- **Node.js** ≥ 20.11.0
- **npm** ≥ 10.0.0
- **PostgreSQL** — local instance, or a free [Supabase](https://supabase.com) project
- **Upstash Redis** — free tier at [upstash.com](https://upstash.com) (or a local Redis instance)
- **Resend** — free API key at [resend.com](https://resend.com) (magic-link emails; skipped locally if key is absent)
- **Google OAuth app** — [console.cloud.google.com](https://console.cloud.google.com) with `calendar.readonly` scope (optional — calendar import only)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/xozai/rally.git
cd rally

# 2. Install all workspace dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Open .env and fill in DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY, etc.
```

### Database

```bash
# Run Prisma migrations against your local Postgres
npm run db:migrate

# (Optional) Seed demo data
npm run db:seed
```

### Running

```bash
# Run all apps in parallel with Turborepo
npm run dev

# Or start each app individually:
npm --workspace apps/api run dev    # Fastify API on http://localhost:4000
npm --workspace apps/web run dev    # Next.js   on http://localhost:3000
```

Visit `http://localhost:3000` — sign in with a magic link (the link is printed to the API console when `RESEND_API_KEY` is not set).

---

## Environment Variables

All variables are documented in `.env.example`. The table below summarises each one.

**Shared**
- `NODE_ENV` — Required — Runtime mode: `development`, `test`, or `production`
- `WEB_URL` — Required — Public origin of the Next.js app (e.g. `https://rally.app`)
- `API_URL` — Required — Public origin of the Fastify API (e.g. `https://api.rally.app`)
- `COOKIE_DOMAIN` — Required — Cookie domain for auth cookies (`localhost` locally, `.rally.app` in prod)

**API (`apps/api`)**
- `PORT` — Optional — Fastify listen port (default: `4000`)
- `DATABASE_URL` — Required — Supabase / Postgres connection string used by Prisma
- `REDIS_URL` — Required — Upstash Redis connection string for queues and rate limiting
- `JWT_SECRET` — Required — ≥ 32-character secret used to sign session JWTs and ICS download tokens
- `TOKEN_ENCRYPTION_KEY` — Required — ≥ 32-character key for AES-256-GCM encryption of OAuth tokens at rest (derived via HKDF)
- `RESEND_API_KEY` — Required (prod) — Resend API key for transactional email
- `RESEND_FROM` — Required (prod) — Sender address, e.g. `Rally <hello@rally.app>`
- `RESEND_WEBHOOK_SECRET` — Required (if email tracking enabled) — Resend webhook signing secret; all incoming webhook requests are now verified with Svix — unsigned requests are rejected
- `GOOGLE_CLIENT_ID` — Optional — Google OAuth client ID (enables Google Calendar import)
- `GOOGLE_CLIENT_SECRET` — Optional — Google OAuth client secret
- `GOOGLE_REDIRECT_URI` — Optional — Google OAuth callback URL
- `MICROSOFT_CLIENT_ID` — Optional — Microsoft OAuth client ID (enables Outlook Calendar import)
- `MICROSOFT_CLIENT_SECRET` — Optional — Microsoft OAuth client secret
- `MICROSOFT_REDIRECT_URI` — Optional — Microsoft OAuth callback URL

**Web (`apps/web`)**
- `NEXT_PUBLIC_API_URL` — Required — Browser-visible API origin consumed by client components

**CI / CD (GitHub Secrets)**
- `VERCEL_TOKEN` — Required — Vercel personal access token
- `VERCEL_ORG_ID` — Required — Vercel team or user ID
- `VERCEL_PROJECT_ID` — Required — Vercel project ID for `apps/web`
- `RAILWAY_TOKEN` — Required — Railway API token for deploying `apps/api`

---

## Security

Rally follows defence-in-depth practices:

- **Per-email rate limiting** — magic-link endpoint is limited to 3 requests per email per hour (Redis-backed, SHA-256 hashed key) in addition to a per-IP limit of 5 per 15 minutes
- **JWT algorithm pinned** — all `jwtVerify` calls specify `{ algorithms: ["HS256"] }` to prevent algorithm confusion attacks
- **HKDF key derivation** — AES-256-GCM encryption keys are derived via HKDF (RFC 5869) rather than plain SHA-256
- **OAuth logs redacted** — only `{ status, error }` fields are logged on OAuth failures; raw response bodies are never written to logs
- **Signed ICS tokens** — `GET /api/events/:id/ics` requires either a valid session cookie or a HMAC-SHA256 signed `?token=` query parameter
- **Invite token expiry** — participant invite tokens expire after 30 days; organisers can rotate and resend via `POST /api/events/:id/participants/:participantId/resend`
- **Zod validation on all DB reads** — JSON columns (`availability`, `preferences`, `constraints`, `votes`, `breakdown`) are validated at runtime before entering business logic
- **Resend webhook signature verification** — `POST /api/webhooks/resend` verifies Svix signatures (`svix-id`, `svix-timestamp`, `svix-signature`) before processing any payload; unsigned requests are rejected with `400`
- **Constant-time OAuth HMAC comparison** — OAuth state signatures are compared with `crypto.timingSafeEqual` to prevent timing-based attacks
- **Event expiry enforced on all participant endpoints** — both the availability and preferences submission endpoints check event-level expiry (in addition to per-invite expiry), returning `410 Gone` for expired rallies
- **Dedicated ICS token key** — ICS download tokens are derived with `TOKEN_ENCRYPTION_KEY` via HMAC-SHA256, not `JWT_SECRET`, keeping session signing and token derivation keys isolated
- **Atomic event deletion** — `onDelete: Cascade` on `Participant` and `Suggestion` relations ensures participants and suggestions are removed atomically with their parent event at the DB level, eliminating the risk of orphaned rows on process crash

---

## Deployment

Full step-by-step instructions are in [DEPLOYMENT.md](./DEPLOYMENT.md).

The summary:

1. **Supabase** — create a project, copy `DATABASE_URL`, run `npm --workspace apps/api exec prisma migrate deploy`
2. **Upstash** — create a Redis database, copy `REDIS_URL`
3. **Railway** — `railway link && railway up --service api --detach` with all API env vars set
4. **Vercel** — `cd apps/web && vercel --prod` with `NEXT_PUBLIC_API_URL` pointing to Railway
5. **Resend webhooks** *(required for email tracking)* — in the Resend dashboard, add a webhook pointing to `POST https://api.rally.app/api/webhooks/resend` for `email.opened` and `email.clicked` events; set `RESEND_WEBHOOK_SECRET` to the signing secret — the endpoint now verifies Svix signatures and will reject unsigned requests

### Required GitHub Secrets

Add these four secrets to your repository (`Settings → Secrets and variables → Actions`) to enable CI/CD:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RAILWAY_TOKEN`

---

## API Reference

All endpoints are served by the Fastify API (`apps/api`). JSON bodies and responses use `Content-Type: application/json`. Authenticated endpoints require a valid session cookie obtained from the auth flow.

### Health

- `GET /health` — No — Returns `{ ok: true }` when the API and database are reachable

### Authentication

- `POST /api/auth/magic-link` — No — Request a magic-link sign-in email; rate-limited to 3 requests per email per hour and 5 per IP per 15 min
- `GET /api/auth/magic-link/verify` — No — Verify a magic-link token, create/upsert user, set session cookie, redirect to dashboard
- `GET /api/auth/session` — No — Return the currently authenticated user (`{ user: { id, email, name } }`)
- `POST /api/auth/logout` — No — Clear the session cookie
- `GET /api/auth/google` — No — Redirect to Google OAuth for sign-in (opens Google consent screen)
- `GET /api/auth/google/callback` — No — Handle Google OAuth callback, exchange code, set session cookie
- `GET /api/auth/google/calendar-connect` — Yes — Redirect authenticated user to Google OAuth for calendar read access
- `GET /api/auth/google/calendar-callback` — No — Handle Google calendar OAuth callback, store encrypted tokens
- `GET /api/auth/microsoft/connect` — Yes — Redirect authenticated user to Microsoft OAuth for Outlook calendar read access
- `GET /api/auth/microsoft/callback` — No — Handle Microsoft OAuth callback, store encrypted tokens

### Events

- `POST /api/events` — Yes — Create a new Rally event; returns `201` with the created event
- `GET /api/events` — Yes — List all events owned by the authenticated organizer
- `GET /api/events/:id` — Yes — Fetch a single event with participants (including `emailStatus`), ranked suggestions, and `icsToken`; returns `410` if expired
- `GET /api/events/:id/status` — No — Public endpoint: returns response progress and anonymized aggregate availability heatmap; safe to share
- `PATCH /api/events/:id/confirm` — Yes — Confirm a final time slot; transitions status to `CONFIRMED` and emails all participants (respects `sendInvites` boolean in body)
- `POST /api/events/:id/participants` — Yes — Invite a participant by email; sends branded invite email with magic join link (token expires in 30 days)
- `POST /api/events/:id/participants/:participantId/resend` — Yes — Rotate a participant's invite token and re-send the invite email; resets expiry to 30 days from now
- `GET /api/events/:id/suggestions` — Yes — Retrieve ranked time-slot suggestions for an event
- `POST /api/events/:id/poll` — Yes — Open a voting poll on top suggestions; emails participants with vote links
- `GET /api/events/:id/ics` — Auth (session cookie **or** `?token=` signed query param) — Download a `.ics` calendar file for a confirmed event
- `DELETE /api/events/:id` — Yes — Delete an event and cascade-delete all participants and suggestions

### Participants

- `GET /api/participants/:token` — No — Look up a participant by invite token; returns `410` if token has expired
- `POST /api/participants/:token/availability` — No — Submit availability intervals (`manual` / `google` / `outlook`); triggers suggestion recompute
- `POST /api/participants/:token/preferences` — No — Submit time preference ratings (`preferred` / `available` / `rather_not`); triggers recompute
- `POST /api/participants/:token/vote` — No — Cast a vote (`yes` / `no` / `maybe`) on a specific suggestion during the VOTING phase
- `PATCH /api/participants/:token/rsvp` — No — Set final RSVP status (`attending` / `declined` / `maybe`) after event is confirmed
- `DELETE /api/participants/:token` — No — GDPR right-to-erasure: wipe availability, preferences, email, and name from the record

### Calendar

- `GET /api/calendar/freebusy` — Yes — Fetch busy intervals from the authenticated user's Google Calendar; auto-refreshes expired tokens
- `GET /api/calendar/outlook/freebusy` — Yes — Fetch busy intervals from the authenticated user's Outlook Calendar; auto-refreshes expired tokens

### Suggestions

- `POST /api/suggestions/compute` — Yes — Manually enqueue a suggestion-recompute job for the given event ID

### Webhooks

- `POST /api/webhooks/resend` — No (Resend-signed) — Receives `email.opened` and `email.clicked` events from Resend; upgrades participant `emailStatus` accordingly

---

## Contributing

We welcome bug reports, feature requests, and pull requests. Please open an issue first for any significant change so we can discuss the approach. All code must pass TypeScript type-checking, ESLint, and the Vitest test suite before merging. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines on branch naming, commit conventions, and the PR review process.

---

## Roadmap

- **Calendar webhooks** — receive push notifications from Google / Outlook when a connected calendar changes, re-score suggestions automatically
- **SMS reminders** — opt-in text message reminders for upcoming confirmed events via Twilio or similar
- **Team workspaces** — shared organizer teams with member management and event ownership transfer
- **Recurring events** — define a cadence (weekly stand-up, monthly all-hands) and let Rally find the best recurring slot
- **Apple Calendar (CalDAV)** — connect iCloud Calendar for iOS / macOS users alongside Google and Outlook
- **Typed API client** — replace raw `fetch()` calls across web pages with a shared Zod-validated client
- **AI suggestions** — LLM-assisted natural-language scheduling: "find a 2-hour slot next week that works for everyone in the afternoon"

---

## License

MIT License

Copyright (c) 2026 Xozai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
