# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Rally is

Social scheduling platform: participants submit availability + time preferences via no-account magic-link invites, and a scoring engine ranks the best meeting slots. Organizers can promote top slots to a vote, then confirm and export an `.ics`.

## Monorepo layout

Turborepo + npm workspaces. Three workspaces:

- `apps/api` (`@rally/api`) — Fastify 4 REST API + WebSocket/SSE, ESM, Prisma/Postgres, BullMQ on Redis
- `apps/web` (`@rally/web`) — Next.js 14 App Router (React Server Components), Tailwind, TanStack Query, Zustand
- `packages/shared` (`@rally/shared`) — TypeScript types + the slot-generation and scoring logic shared by API and web

`@rally/shared` is consumed as a built package (`main`/`types` point at `dist/`), so Turbo's `test`/`build` tasks depend on `^build`. If you change shared code, rebuild it (`npm run build`) before API/web pick it up.

## Commands

Run from repo root (Turbo fans out to all workspaces):

```bash
npm run dev         # all apps in parallel — API on :4000, web on :3000
npm run build       # turbo build (respects ^build dependency order)
npm run lint        # eslint across workspaces
npm run typecheck   # tsc --noEmit across workspaces
npm run test        # vitest run across workspaces
```

Per-workspace (use the `--workspace` flag):

```bash
npm --workspace apps/api run dev          # tsx watch on src/server.ts
npm --workspace apps/web run dev          # next dev
npm --workspace apps/api run test         # vitest for the API only
npm --workspace packages/shared run test  # scoring/slot tests
```

Single test file / single test:

```bash
npm --workspace apps/api exec vitest run src/lib/__tests__/crypto.test.ts
npm --workspace apps/api exec vitest run -t "name of the test"
```

Database (Prisma, in `apps/api`):

```bash
npm run db:generate                        # prisma generate (also at root)
npm --workspace apps/api run db:migrate    # prisma migrate dev
npm --workspace apps/api run db:seed       # ts-node prisma/seed.ts
npm --workspace apps/api run db:studio     # prisma studio
npm --workspace apps/api run db:reset      # migrate reset --force
```

CI (`.github/workflows/ci.yml`) runs `lint` → `typecheck` → `test` on every push/PR, then deploys web to Vercel and API to Railway on push to `main`. Match these locally before pushing.

## Architecture notes

**Scoring engine lives in `packages/shared`.** `scheduling.ts` (`rankSuggestions`/`scoreSlot`) and `slots.ts` (candidate generation) are the heart of the product and are pure/unit-tested. Preference points: `preferred` = +2, `available` = +1, `rather_not` = −1. `rankSuggestions` sorts by score then start time and returns the top 5, ranked. Keep this logic in `shared` (not in API routes) so both sides stay consistent.

**API composition.** `apps/api/src/app.ts` (`buildApp`) registers cors/cookie/rate-limit plugins, wires realtime, registers route modules from `src/routes/`, and starts the BullMQ worker. `server.ts` is the entrypoint that calls `buildApp` and listens. Environment is Zod-validated in `src/env.ts` — add new env vars there, not ad-hoc `process.env` reads.

**Background jobs degrade gracefully without Redis.** `src/jobs/queues.ts` creates BullMQ queues only when `REDIS_URL` is set; otherwise `enqueueRecompute` runs the recompute synchronously inline. Any availability/preference submission enqueues a suggestion recompute, which re-scores all candidate slots, writes ranked `Suggestion` rows, and calls `notifyEventUpdated` to push realtime updates.

**Auth.** `src/auth/session.ts` issues HS256 JWTs via `jose` (30-day session, 15-min magic-link with a unique `jti` that's blacklisted in Redis after first use). `require-user.ts` is the guard for authenticated routes. OAuth calendar tokens are encrypted at rest (AES-GCM, `src/lib/crypto.ts`, key from `TOKEN_ENCRYPTION_KEY`).

**Participant flow is token-based, not session-based.** `/api/participants/:token/*` endpoints are unauthenticated — the unguessable invite `token` *is* the credential. This is how guest mode works without accounts.

**Data model** (`apps/api/prisma/schema.prisma`): `User` → organizes `Event`s and has `Participant`ions; `Event` has `Participant`s and ranked `Suggestion`s, with `status` (`OPEN`/`VOTING`/`CONFIRMED`/…), JSON `constraints`, and `expiresAt`. `availability`, `preferences`, and suggestion `breakdown` are JSON columns — their shapes are the TypeScript types in `@rally/shared`, so update types and DB usage together.

**Realtime** is in `src/realtime.ts` — a broadcaster over `@fastify/websocket`/SSE that pushes response counts and suggestion updates to open organizer tabs.

## Conventions

- TypeScript is `strict` with `noUncheckedIndexedAccess` (see `tsconfig.base.json`) — indexed access yields `T | undefined`; handle it.
- API is ESM (`"type": "module"`); use `.js`-less relative imports as the existing files do.
- Validate all external input with Zod at the route boundary.
- Code references issue numbers in comments (e.g. `// ... (#17)`) — these point at GitHub issues; preserve them when editing nearby code.
- Conventional Commits are used (see git history and `CONTRIBUTING.md`).
