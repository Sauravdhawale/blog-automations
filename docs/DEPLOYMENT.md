# Deployment and operations

## Runtime and authentication boundary

This repository is built for Sites on Cloudflare Workers. `.openai/hosting.json` declares logical D1 (`DB`) and R2 (`BUCKET`) bindings. Sites provisions the production resources and applies generated SQL migrations before uploading the Worker.

The private deployment uses dispatch-owned ChatGPT sign-in. The dispatcher injects trusted `oai-authenticated-user-id` and `oai-authenticated-user-email` headers; the app applies its own database memberships and roles afterward. Never expose the raw Worker to untrusted traffic that can supply these headers. An independent VPS or other host needs a verified identity gateway or replacement authentication implementation before it is safe to expose.

Initialize the first administrator on an owner-only deployment before granting other users access. The application records that first authenticated account as Admin. Later users must be invited by the exact account email. An app invitation does not change the hosting access policy.

## Secrets

Use the hosting environment's secret manager. Never add secrets to git or the browser bundle.

- `CREDENTIAL_ENCRYPTION_KEY`: at least 32 random bytes encoded as a string. Used to derive the AES-GCM encryption key for WordPress credentials. Keep a secure backup. Do not rotate without re-encrypting stored credentials or reconnecting every website.
- `CRON_SECRET`: optional strong random value that authenticates the daily brief runner. If absent, the endpoint rejects requests and the UI shows setup required.

`.env.example` documents the names only. Production secrets are managed outside this repository.

## Database migrations

Schema lives in `db/schema.ts`; generated SQL and metadata live in `drizzle/`. Applied migrations are immutable.

```bash
pnpm run db:generate
pnpm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_calm_cloak.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_shocking_retro_girl.sql
```

Apply each pending migration once, in order. Production uses Sites deployment migrations; the commands above only initialize local development.

## WordPress

Create a dedicated WordPress user with the capabilities you want to permit. Generate an Application Password under Users → Profile. Connect over HTTPS. The backend checks public DNS and rejects credential-bearing URLs, private addresses, and redirects.

The app checks `edit_posts` during sync and checks `publish_posts` / `upload_files` when those actions are needed. Author/category availability depends on the WordPress account. Stored passwords are not returned to the browser.

WordPress REST errors and permission failures are shown to the user. A timeout after submitting a post changes the status to `Publishing uncertain`. Reconcile by slug before taking further action. Do not blindly retry creation. If no match is found, manually verify WordPress before any administrator repair.

WordPress handles future publication after the approved post is successfully submitted. Configure reliable WP-Cron on your WordPress installation if exact publication timing is important.

## n8n daily briefs

Use a Schedule Trigger, for example every 15 minutes, followed by an HTTP Request node:

- Method: `POST`
- URL: `https://YOUR_APP_DOMAIN/api/cron`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- For owner-private Sites: also supply the platform service-access credential in `OAI-Sites-Authorization`; obtain it through supported platform administration, not by copying a browser session.

Each enabled schedule evaluates its own IANA timezone and weekdays. A unique database index prevents more than one automatic brief per schedule/local date. Manual Run Now intentionally creates a separate brief. Missed earlier dates are not backfilled.

The runner currently creates an `Awaiting ChatGPT` article with a complete prompt. It does not call AI inference, send email, publish, or approve. Approval always requires a user action.

## Automatic ChatGPT generation

Not connected in this delivery. Implement only after confirming that the deployment and users are eligible for official ChatGPT plan usage. Separate identity scopes from inference authorization. Use per-user tokens and an explicitly assigned account for unattended jobs. Do not scrape cookies, share credentials across users, or use private ChatGPT endpoints.

Official entry point: https://developers.openai.com/siwc/token-sharing-open-source

The documented plan-usage preview excludes image generation. Verify current capabilities before adding any provider. Until a supported route is configured, keep the existing assisted workflow and accurate UI labels.

## Backups

Back up D1 records, R2 assets, and the credential-encryption secret through the hosting provider. Git stores application source only, not user content or credentials.
