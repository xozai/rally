# Rally

Rally is a social-first group availability finder. Organizers create an event, invite friends, and Rally combines calendar availability, personal preferences, and smart scheduling logic to recommend the best time to meet.

This repository is a TypeScript monorepo with:

- `apps/web`: Next.js App Router frontend for organizers and participants.
- `apps/api`: Fastify API for auth, event workflows, calendar integrations, and realtime scheduling.
- `packages/shared`: Shared Rally domain types and scheduling utilities.

## Phase 1 Scope

Implemented in this scaffold:

- Monorepo workspaces with Turbo.
- Next.js 14 App Router app with Tailwind CSS and shadcn-style UI primitives.
- Fastify API with strict TypeScript, Zod validation, Prisma schema, JWT httpOnly cookie sessions, Resend magic links, and Google OAuth login.
- Shared scheduling scorer with Vitest tests.
- CI workflow for lint, typecheck, and tests.

## Getting Started

```bash
npm install
npm run db:generate
npm run dev
```

The web app defaults to `http://localhost:3000` and the API defaults to `http://localhost:4000`.

## Environment

Copy `.env.example` to `.env` and fill in the required values. Secrets are read from environment variables only.

```bash
cp .env.example .env
```

## Deploy Targets

- Web: Vercel
- API: Railway
- Database: Supabase Postgres
- Redis/cache/jobs: Upstash Redis
- Email: Resend

## Privacy

Rally stores free/busy intervals and event-specific preferences. Raw calendar event titles, locations, descriptions, and attendees should never be persisted.
