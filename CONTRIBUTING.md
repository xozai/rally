# Contributing

## Local Development

```bash
npm install
npm run db:generate
npm run dev
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test
```

## Standards

- Keep TypeScript strict.
- Validate API inputs with Zod.
- Store secrets only in environment variables.
- Do not store raw calendar event data.
- Encrypt OAuth tokens before persistence.
- Keep shared types in `packages/shared` when they cross app boundaries.
