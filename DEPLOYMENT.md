# Rally Deployment

## Prerequisites

- Node 20 and npm 10.
- Railway CLI:

  ```bash
  npm install -g @railway/cli
  ```

- Vercel CLI:

  ```bash
  npm install -g vercel
  ```

- Supabase CLI:

  ```bash
  npm install -g supabase
  ```

## Supabase Setup

1. Create a Supabase project at `https://supabase.com`.
2. Copy the project Postgres connection string into `DATABASE_URL`.
3. Run Prisma migrations:

   ```bash
   npm --workspace apps/api exec prisma migrate deploy
   ```

4. Optionally seed local demo data:

   ```bash
   npm --workspace apps/api run db:seed
   ```

## Upstash Redis

1. Create a Redis database at `https://upstash.com`.
2. Copy the Redis connection string into `REDIS_URL`.
3. Add `REDIS_URL` to Railway for the API service.

## Railway API

1. Sign in:

   ```bash
   railway login
   ```

2. Link the project:

   ```bash
   railway link
   ```

3. Add API environment variables in Railway:

   ```bash
   railway variables set NODE_ENV=production
   railway variables set API_URL=https://api.rally.app
   railway variables set WEB_URL=https://rally.app
   railway variables set COOKIE_DOMAIN=.rally.app
   railway variables set DATABASE_URL=<supabase-database-url>
   railway variables set REDIS_URL=<upstash-redis-url>
   railway variables set JWT_SECRET=<32-plus-character-secret>
   railway variables set TOKEN_ENCRYPTION_KEY=<32-plus-character-secret>
   railway variables set RESEND_API_KEY=<resend-api-key>
   railway variables set RESEND_FROM="Rally <hello@rally.app>"
   railway variables set GOOGLE_CLIENT_ID=<google-client-id>
   railway variables set GOOGLE_CLIENT_SECRET=<google-client-secret>
   railway variables set GOOGLE_REDIRECT_URI=https://api.rally.app/api/auth/google/callback
   railway variables set MICROSOFT_CLIENT_ID=<microsoft-client-id>
   railway variables set MICROSOFT_CLIENT_SECRET=<microsoft-client-secret>
   railway variables set MICROSOFT_REDIRECT_URI=https://api.rally.app/api/auth/microsoft/callback
   ```

4. Deploy:

   ```bash
   railway up --service api --detach
   ```

5. Verify:

   ```bash
   curl https://api.rally.app/health
   ```

If the Railway CLI reports that you are not signed in, finish the browser sign-in flow it opens, then rerun `railway link` and `railway up --service api --detach`.

## Vercel Web

1. Sign in:

   ```bash
   vercel login
   ```

2. Link the web app:

   ```bash
   cd apps/web
   vercel link
   ```

3. Add web environment variables in Vercel:

   ```bash
   vercel env add NEXT_PUBLIC_API_URL production
   ```

4. Deploy:

   ```bash
   vercel --prod
   ```

## GitHub Secrets

Add these repository secrets in GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RAILWAY_TOKEN`

## DNS

- Point `rally.app` to Vercel for the web app.
- Point `api.rally.app` to the Railway API custom domain.

## Post-Deploy Checklist

- Verify `https://api.rally.app/health` returns `{"ok":true}`.
- Test magic link authentication end to end.
- Create an event from the dashboard.
- Invite participants and submit availability.
- Confirm email delivery through Resend.
- Check Railway and Vercel logs for runtime errors.
