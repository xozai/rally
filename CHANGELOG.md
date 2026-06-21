# Changelog

## [1.1.0](https://github.com/xozai/rally/compare/v1.0.0...v1.1.0) (2026-06-21)


### Features

* **email:** add open/click tracking for invite emails via Resend webhooks ([#67](https://github.com/xozai/rally/issues/67)) ([a3ace41](https://github.com/xozai/rally/commit/a3ace4174dd8952ca373fe83b1ede53bc63c29e7))
* **security:** add opt-in ES256 asymmetric JWT signing ([#65](https://github.com/xozai/rally/issues/65)) ([75f25c3](https://github.com/xozai/rally/commit/75f25c3da635840676b2fb39935215901e8a73bb))
* **web:** add public event status page ([#69](https://github.com/xozai/rally/issues/69)) ([f45de20](https://github.com/xozai/rally/commit/f45de2059b21693cc94806e221e4dce229562f2e))


### Bug Fixes

* **api:** add runtime Zod validation for JSON columns (availability, preferences, constraints) ([#59](https://github.com/xozai/rally/issues/59)) ([30968f6](https://github.com/xozai/rally/commit/30968f6e3454ee3d75fdfb3cb448ebf6639e2a38))
* **auth:** add per-email Redis rate limit on magic-link endpoint ([#56](https://github.com/xozai/rally/issues/56)) ([4b00c46](https://github.com/xozai/rally/commit/4b00c46ba3c637e23a2fc095961171d02fae1b4b))
* **events:** respect sendInvites flag in confirm endpoint ([#54](https://github.com/xozai/rally/issues/54)) ([ee635f5](https://github.com/xozai/rally/commit/ee635f5629e62e912c509914252131cdb8957dcc))
* **security:** add expiry to participant invite tokens ([#60](https://github.com/xozai/rally/issues/60)) ([d0b365c](https://github.com/xozai/rally/commit/d0b365c3fd702b6fc87cbd8b7c4fc2d1d372845e)), closes [#27](https://github.com/xozai/rally/issues/27)
* **security:** pin JWT algorithm and replace SHA-256 KDF with HKDF ([#55](https://github.com/xozai/rally/issues/55)) ([952b73c](https://github.com/xozai/rally/commit/952b73c5984eb30dbe6b7532bd06745789107a13))
* **security:** protect ICS endpoint with HMAC-signed download token ([#58](https://github.com/xozai/rally/issues/58)) ([3fb9161](https://github.com/xozai/rally/commit/3fb9161f458db2363bd5a9d7c785c42030bddbd1))
* **security:** redact raw OAuth error responses from logs ([#57](https://github.com/xozai/rally/issues/57)) ([a8bf8e2](https://github.com/xozai/rally/commit/a8bf8e26a06e2a0ecd694674b8979123c19e2597))
* **shared:** add standalone eslintrc to avoid inheriting next/core-web-vitals from root ([#66](https://github.com/xozai/rally/issues/66)) ([8903fbc](https://github.com/xozai/rally/commit/8903fbcf9c3f18ad51b64666f3c82890aaae2683))
* **types:** align EventConstraints interface with actual stored JSON schema ([#62](https://github.com/xozai/rally/issues/62)) ([bd9ae17](https://github.com/xozai/rally/commit/bd9ae1730079b36ea8726f24b797d9e67a3c6a47))

## 1.0.0 (2026-06-16)


### Features

* MVP features — RSVP, event expiry, timezone, invite more, privacy/terms, GDPR delete ([5204352](https://github.com/xozai/rally/commit/5204352ce8525d76ae4b72ba60ae9d895064d7fc))
* phase 1 scaffold — monorepo, auth, shared types, suggestion engine ([6709372](https://github.com/xozai/rally/commit/670937237559bdfe0879f1941c4c8b79b3660334))
* phase 2 — event creation wizard, invite flow, participant routes, organizer dashboard ([3a583ed](https://github.com/xozai/rally/commit/3a583ed18998b3c4f3c988d5d6f062280f1b183c))
* phase 3 — availability grid, calendar integrations, slot engine, participant flow, .ics export ([108e96b](https://github.com/xozai/rally/commit/108e96bee5b53f9cd040ff0ab4a1e57c68a9268c))
* phase 4 — suggestion engine wiring, WebSocket real-time, voting UI, confirm flow, notification emails ([664c85a](https://github.com/xozai/rally/commit/664c85add5a6192392d7ce11d402853250df4ca0))
* phase 5 — landing page, branded emails, mobile responsiveness, error handling ([95632a9](https://github.com/xozai/rally/commit/95632a97fcf790f671331947b0de646148d691a1))
* phase 6 — deployment infra, CI/CD, health route, DB seed, DEPLOYMENT.md ([a0946af](https://github.com/xozai/rally/commit/a0946afc4d7f213ae251ecc19db3868585b0f6c9))


### Bug Fixes

* [#19](https://github.com/xozai/rally/issues/19) — specific_month throws descriptive error on string/NaN month ([f7b96c4](https://github.com/xozai/rally/commit/f7b96c42468fb4fd3a69b1a9c6a8718953e307a2))
* add @rally/shared path aliases in web and api tsconfigs for CI typecheck ([f32519f](https://github.com/xozai/rally/commit/f32519fd1005e9083d1eb79b73e0631098488aa1))
* escape unescaped entities in JSX to pass ESLint ([25cf918](https://github.com/xozai/rally/commit/25cf9187c229c757ead74130b592a534e2cb7a2c))
* resolve @rally/shared via source paths in tsconfig, fix bounds null error in availability page ([bf72a87](https://github.com/xozai/rally/commit/bf72a8741a2ae64d48debbbf7fc81c30ef889dbe))
* resolve all typecheck CI failures ([50e6f92](https://github.com/xozai/rally/commit/50e6f92315c6d6d6e8160470cccf8cebf0b81b95))
* widen isEncryptedPayload param to unknown to fix type predicate error ([19b1110](https://github.com/xozai/rally/commit/19b11107f47556ac3b608ce4e8a03424cd5cc9a9))

## Changelog

All notable changes to this project will be documented here.

This file is auto-generated by [release-please](https://github.com/googleapis/release-please).
Do not edit manually — your changes will be overwritten on the next release.
