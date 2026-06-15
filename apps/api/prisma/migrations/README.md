# Prisma Migrations

This directory stores checked-in Prisma migration history for the Rally API.

## Local Development

1. Set `DATABASE_URL` in the repository root `.env`.
2. Create a migration after editing `schema.prisma`:

   ```bash
   npm --workspace apps/api run db:migrate
   ```

3. Seed local demo data when needed:

   ```bash
   npm --workspace apps/api run db:seed
   ```

4. Reset a local database from scratch:

   ```bash
   npm --workspace apps/api run db:reset
   ```

## Production

Run migrations against the Supabase production database during controlled releases:

```bash
npm --workspace apps/api exec prisma migrate deploy
```

Do not edit existing migration folders after they have been applied to a shared or production database. Add a new migration instead.
