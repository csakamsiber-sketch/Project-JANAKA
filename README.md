# JAMUS-KALIMASADA-Project

## Same-origin Vercel deployment

The web app exposes the API under the same public origin. The browser calls `/api/v1/...`; Next.js rewrites that request to the separately deployed NestJS API, so browser requests and auth cookies remain same-origin.

Create two Vercel projects from this repository:

1. **Web project**: Root Directory `apps/web`, Framework Preset `Next.js`, and attach the public domain (for example, `appurl.example.com`). Set `API_PROXY_TARGET` to the backend deployment origin only, such as `https://project-janaka-api.vercel.app` (no path or trailing slash). Set it for Production and Preview. The rewrite in `apps/web/next.config.mjs` maps `/api/*` to the backend's matching `/api/*` route.
2. **API project**: Root Directory `apps/api`. Deploy its Node server on Vercel and use its deployment origin as the upstream in `API_PROXY_TARGET`; users should access it through the web domain's `/api` path.

The public API base is `https://appurl.example.com/api/v1`. Keep `NEXT_PUBLIC_API_URL` unset: the web client uses the relative `/api/v1` path. Configure the API project's backend secrets from `apps/api/.env.example`, and set `CORS_ALLOWED_ORIGINS` to include the public web domain. Direct browser-to-API CORS is not used for this same-origin setup.

For local development, the rewrite defaults to `http://localhost:4110`; run the repository's `npm start` command to start both workspaces.

The API skips its in-process application URL checks and CVE scan when running on Vercel. Serverless instances can start concurrently and be stopped between invocations, so process timers are not a reliable scheduler. Run these recurring jobs from a persistent worker or an external scheduler if they are required in production.

## Restricted Google Sheets

The API can read private verification spreadsheets with a Google service account.

1. In Google Cloud Console, enable the Google Sheets API and create a service account.
2. Copy the service account email and private key into `apps/api/.env` using `apps/api/.env.example` as a template.
3. Share each verification spreadsheet with the service account email as **Viewer**.
4. Start the API with `npm start` and use the spreadsheet URL in the application form.

The service account is used only by the backend. The browser never receives the private key. Without these credentials, public Google Sheets continue to use the existing GViz fallback.