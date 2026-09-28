# First Deployment to Vercel

This repository deploys the Next.js frontend and NestJS API as one Vercel project and one origin. The frontend is served at `/`; the API is available at `/api/v1` and through the configured `/vercel/api` alias.

## Read This Before Public Launch

This setup is suitable for a first deployment and smoke test, but it is not yet ready for unrestricted public production use:

- API rate limits are stored in process memory. Vercel instances do not share those counters, so login and OTP limits are not global.
- Manual sync job state is stored in process memory and work is started without durable queueing. Polling another Vercel instance may not find the job, and Vercel may stop work after the request completes.

Before opening access to the public, move rate limiting to Redis and sync work/status to a durable shared queue or database. Do not rely on Vercel instance memory for security controls or background work.

## 1. Prepare External Services

Have these ready before importing the repository:

- A Supabase PostgreSQL project. Use its transaction pooler connection string for `DATABASE_URL` and its direct connection string for `DIRECT_URL`.
- A hosted Redis service that provides TLS. Use a `rediss://` URL; the local Docker Compose container is not reachable from Vercel.
- SMTP credentials for OTP and security emails.
- A Cloudflare Turnstile widget with hostnames for the Vercel production hostname and any custom domain. Use the site key on the web side and the secret key only on the API side.
- Optional Google service-account credentials if the deployment needs access to private Google Sheets.

Rotate any credentials that were previously stored in an env example or committed to Git. Generate separate random values for `JWT_SECRET`, `FINGERPRINT_PEPPER`, `COOKIE_SECRET`, and `CRON_SECRET`. Never reuse one secret for multiple variables.

## 2. Push the Repository to GitHub

1. Make sure your deployment changes are committed and pushed to a GitHub repository.
2. Check that `.env`, `.env.local`, and real service-account key files are not committed.
3. Keep `apps/api/.env.example` and `apps/web/.env.example` as templates only; do not enter real credentials into those files.

## 3. Create the Vercel Project

1. Sign in at [vercel.com](https://vercel.com/) and choose **Add New... > Project**.
2. Import the GitHub repository.
3. In project configuration, set **Root Directory** to `apps/web`.
4. Enable **Include source files outside of the Root Directory in the Build Step**. The API function uses the compiled Nest output under `apps/api/dist`.
5. Select the Next.js framework preset and set the Node.js version to **22.x** in Project Settings.
6. Keep the repository's install, build, and output settings from `apps/web/vercel.json`. Do not replace them with commands that build only the web workspace.

The build runs `prisma generate`, compiles the Nest API, and then builds Next.js.

## 4. Add Environment Variables

In Vercel, open **Project > Settings > Environment Variables**. Add production values to **Production**. Use separate test services and secrets for **Preview** deployments. Avoid sharing production database credentials with preview deployments.

Add these API variables. Use the exact variable names; values come from your service providers:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL, using TLS and a low connection limit |
| `DIRECT_URL` | Supabase direct Postgres URL, for Prisma migrations |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase server-side secret key; never expose it to the browser |
| `REDIS_URL` | Hosted Redis TLS URL beginning with `rediss://` |
| `JWT_SECRET` | Unique random secret |
| `FINGERPRINT_PEPPER` | Different unique random secret |
| `COOKIE_SECRET` | Different unique random secret |
| `CRON_SECRET` | Different random secret, at least 16 characters |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `SMTP_HOST` | SMTP provider hostname |
| `SMTP_USER` | SMTP account username |
| `SMTP_PASSWORD` | SMTP account password or app password |
| `SMTP_FROM` | Verified sender address |

Add these web variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/vercel/api` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

Optional API variables:

- `SUPABASE_JWKS_URL` if you need to override the derived Supabase JWKS URL.
- `CORS_ALLOWED_ORIGINS` only if a separate, intentionally cross-origin web client will call this API. For this single-origin deployment, it can be omitted.
- `GOOGLE_SERVICE_ACCOUNT_JSON`, or both `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, for private Sheets. Keep all Google credentials on the API side.

Do not set `NEXT_PUBLIC_` on secrets. Variables with that prefix are included in browser-visible code. Set `NEXT_PUBLIC_API_URL` and the site key before building, then redeploy after changing either value.

## 5. Run Database Migrations

Before using the deployed API, apply the checked-in Prisma migrations to the production database. Run `prisma migrate deploy` from a secure terminal or CI job with the production `DATABASE_URL` and `DIRECT_URL` available as environment variables. Do not put connection strings in shell history, source files, or this guide. Do not use `prisma migrate reset` against production.

## 6. Deploy

1. Choose **Deploy** in Vercel.
2. Open the deployment's **Build Logs**.
3. Confirm the API Prisma generation/build finishes before the Next.js production build.
4. If the build says `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is missing, add it to the correct Vercel environment and redeploy.
5. When the deployment is ready, open its `vercel.app` URL.

## 7. Smoke-Test the Deployment

1. Load the home/login page and confirm assets render.
2. Visit `https://YOUR_DEPLOYMENT.vercel.app/vercel/api/auth/me`. When logged out, a JSON `401` response is expected; it confirms the API route is reachable.
3. Open browser developer tools and confirm API requests use `/vercel/api/...`, not `localhost` or an unrelated API host.
4. Confirm the Cloudflare Turnstile challenge loads. Test sign-in and OTP delivery with a test account.
5. After signing in, verify the session and CSRF cookies are present. The session and refresh cookies should be `Secure`, `HttpOnly`, and `SameSite=Strict`; the CSRF cookie is intentionally readable by browser code.
6. Test one read and one write operation, plus logout and refresh. Check the Vercel function logs and API logs if a request fails.
7. In **Project > Settings > Cron Jobs**, confirm the configured cron appears. The endpoint should return `401` if opened directly without the Vercel authorization header; do not paste or share `CRON_SECRET` to test it manually.

## 8. Understand the Cron Schedule

The checked-in schedule runs once daily at 11:00 UTC, which is 18:00 in Jakarta. Vercel Hobby allows only one run per day and may start it at any time during that hour. Vercel Pro and Enterprise support more frequent schedules; only change the configuration to two daily runs after confirming your plan supports it.

Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when the `CRON_SECRET` project variable is configured. Cron runs only on production deployments, and Vercel does not automatically retry a failed cron invocation. Inspect the Cron Job logs after its first run.

## 9. Add a Custom Domain (Optional)

1. Open **Project > Settings > Domains** and add the domain.
2. Apply the DNS records Vercel displays.
3. Add the exact hostname to the Cloudflare Turnstile widget's allowed hostnames.
4. Redeploy if you changed environment variables. Same-origin frontend/API requests do not need a CORS entry.
5. If another website will call the API cross-origin, add only its exact origin to `CORS_ALLOWED_ORIGINS` and review cookie/browser restrictions separately.

## Troubleshooting

- **Build fails with Turnstile key error:** Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the matching Production or Preview environment and redeploy.
- **Build cannot find `apps/api/dist`:** Check Root Directory is `apps/web`, outside-root source inclusion is enabled, and the configured build command has not been replaced.
- **API reports missing env values:** Add the exact server-side names from the API table and redeploy. Never use `localhost` for database or Redis in Vercel.
- **Login works but OTP email fails:** Verify SMTP host, user, password, sender, and provider security settings.
- **Turnstile does not load or verify:** Confirm the site key is public, the secret is only on the API, and the hostname is added to the widget.
- **Cron deployment is rejected on Hobby:** Keep the once-per-day schedule in `apps/web/vercel.json`; Hobby rejects schedules that run more than once daily.
- **Sync job disappears or progress stops:** This is the documented in-memory job-state limitation. Do not treat the sync as durable until it uses shared persistent storage/queueing.

For official details, see [Vercel project configuration](https://vercel.com/docs/project-configuration), [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), and [Cron management and authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
