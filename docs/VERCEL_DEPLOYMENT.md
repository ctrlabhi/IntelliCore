# Deploy IntelliCore on Vercel

Import the repository root as a Vercel **Express** project and use the Node.js **24.x** runtime. Keep Vercel system environment variables enabled so the runtime can select its hosted database, storage and scheduler settings. The root `app.js` exports the existing Express application. The build generates the Prisma client and publishes the frontend assets to Vercel's CDN. HTML, login, dashboard routes, APIs and per-user downloads use the same Express origin. Docker Compose remains the local development environment. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

The company site and its one-minute notification schedule require a Vercel plan that supports commercial use and minute-wise Cron. Vercel Pro supports this configuration. [Vercel plans](https://vercel.com/docs/plans/hobby) · [Cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

## Preview services and environment settings

Provision a verified external MySQL **8.4** instance and a **private** Vercel Blob store. Use distinct credentials and storage for Preview and Production. Use an isolated application schema and authorized test identities in Preview. Choose the Vercel Function region near the database. Vercel hosts the application and Blob store. MySQL runs on its own MySQL-compatible infrastructure.

| Vercel variable | Value or setup |
| --- | --- |
| `APP_BASE_URL` and `CORS_ORIGIN` | Approved deployment HTTPS origin for that environment. |
| `DATABASE_URL` | Least-privilege MySQL runtime account with the target schema and supported TLS endpoint. The app enforces strict certificate verification and caps the web and worker Prisma pools at two connections each. |
| `NOTIFICATION_DATABASE_URL` | A distinct `intellicore_worker*` account on the same MySQL schema and endpoint, with the table grants below. |
| `FIREBASE_PROJECT_ID` | The approved identity project currently allowed by the code is `intellicore-dev`. The quarantined Firebase project stays out of the deployment. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server-only service-account JSON for `intellicore-dev`. Set it as a sensitive Vercel variable. Use an explicitly authorized OAuth origin and account. |
| `FOUNDER_EMAIL`, `FOUNDER_FIREBASE_UID` | Existing approved Founder identity for the target database. |
| `BLOB_READ_WRITE_TOKEN` | Provided by the private Blob integration. Never expose it in frontend code. |
| `CRON_SECRET` | Random secret of at least 32 characters. Vercel sends it as a Bearer authorization header. |
| `NOTIFICATION_CRON_ENABLED` | Set `true` only once the schema and worker grants are verified. |
| `EMAIL_DELIVERY_MODE` | Use `CAPTURE` by default. `DISABLED` is supported. The Vercel scheduler accepts no SMTP delivery mode. |

Keep migration credentials out of the Vercel web project. Do not upload local `.env` files, backups, upload volumes or secrets. [Private Blob storage](https://vercel.com/docs/vercel-blob/private-storage) · [Cron authentication](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).

## Data preparation and scheduled notifications

1. Back up the approved source database and private file volume. Verify a restore rehearsed on isolated infrastructure. For an empty preview schema, use synthetic fixtures. For a cutover, restore a consistent source snapshot to the destination under the owner-approved migration account.
2. Verify the destination identity and migration checksums. Run `prisma migrate status`, then `prisma migrate deploy` with the dedicated migration account on the selected destination. Confirm zero unexpected drift. The Vercel build runs only `prisma generate`. It does not migrate or seed databases.
3. For existing attachments, use each MySQL `file_attachments.storage_key` to copy the original private file to the exact private Blob pathname `phase06/<storage-key>` without random suffixes or overwrites. Verify the length and stored checksum from an authorized download in the target environment. Preserve the source volume until the destination is accepted. New Vercel uploads are limited to **4 MiB** so server-side validation stays within Vercel's request limit. Existing downloads stream through Express after authorization. [Vercel request and streaming limits](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
4. Set up the table-scoped grant set from [Background processing](BACKGROUND_PROCESSING.md). Add `SELECT, INSERT, UPDATE` on `notification_cron_state` for the worker only. The scheduled function reuses the business worker rules and persists its lease and reminder cursors in MySQL. Avoid running the Docker worker against the same hosted schema during cutover.
5. Verify `/health`, `/ready`, `/api-docs/`, the homepage, Notes, protected dashboards and attachment upload/download. The readiness route verifies database connectivity and the presence of hosted identity and storage configuration. Validate a real authorized login, a private Blob round trip and an authenticated Cron tick before declaring readiness. Calendar writes stay disabled. Existing Calendar OAuth is restricted to the authorized local integration.

## Domain cutover

Verify the preview on its Vercel URL before changing DNS. Add the intended domain to the Vercel project and use the exact records shown by Vercel for that domain. Preserve the existing GoDaddy and GitHub Pages setup until the app, database, identity and worker pass acceptance. [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
