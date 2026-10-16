# Deploying

The app is one Worker. It serves both the API and the built frontend from a single
origin — not for convenience, but because the frontend fetches relative `/api/…` paths
and the session cookie is `SameSite=Lax`. Split them across two hostnames and both the
requests and the login break.

## The short version

```bash
npx wrangler login
scripts/provision.sh          # creates D1, KV and R2, writes the ids into wrangler.toml
# set ENVIRONMENT = "production" in apps/api/wrangler.toml
npm run db:migrate:remote
npx wrangler secret put ANTHROPIC_API_KEY --config apps/api/wrangler.toml
scripts/deploy.sh             # typechecks, tests, builds, deploys
```

Both scripts refuse to run when you are not signed in, and `deploy.sh` refuses while
the config still holds placeholder ids or is still marked as a development environment.

## Before the first deploy

You need a Cloudflare account. The free plan is enough — nothing here uses Queues,
Containers or Browser Rendering.

Create the three stores and paste the ids into `apps/api/wrangler.toml`, which currently
holds `local-dev-placeholder` for both:

```bash
npx wrangler d1 create bbcm-summons          # → database_id
npx wrangler kv namespace create SESSIONS    # → id
npx wrangler r2 bucket create matter-documents
```

Apply the migrations to the remote database, then set the extraction key:

```bash
npm run db:migrate:remote
npx wrangler secret put ANTHROPIC_API_KEY --config apps/api/wrangler.toml
```

Set `ENVIRONMENT = "production"` in `wrangler.toml` so the session cookie is marked
`Secure`.

## Every deploy

Build the frontend first. `[assets] directory` points at `apps/web/dist`, so a stale or
missing build ships a stale or missing site:

```bash
npm run build
npx wrangler deploy --config apps/api/wrangler.toml
```

## Getting in the first time

A fresh deployment has no users, and firms and users are created under `/api/admin/*`,
which requires a signed-in administrator. So there is no way in until you create the
first account:

```bash
node scripts/bootstrap-firm.mjs --remote
```

It asks for the firm and administrator details, then a password which it does not echo
and never writes anywhere but the hash. It also installs the eight starter templates,
without which no document can be generated.

It refuses to run once any user exists, so it cannot be used later to add an account to
a live system — create further users inside the app under Admin → Users, where the
action is authenticated and recorded in the audit trail.

**There is no password reset in this application.** Put the password in a password
manager before you type it.

## Do not run the seed script against production

`apps/api/scripts/seed.mjs` writes a demo firm, a demo attorney and a known password. It
is for local development. A real firm gets created through the app.

## Before real client data goes in

These are not deployment steps. They are the difference between a working site and one
that should hold other people's divorce records.

- **Validate PDF/A.** The bundles carry the structures but no validator has issued a
  verdict. Run veraPDF before telling a court the output is PDF/A.
- **The POPIA programme.** Authentication, per-firm scoping, encryption in transit and
  an audit trail are all in place. An Information Officer register, data-subject access
  and erasure workflows, and a retention policy are not. That gap is the difference
  between "more secure than the original" and "compliant", and only the second is a
  defence.
- **Verify the Uniform Rule 4 service manners** against the rule itself. The list was
  written from secondary sources.
- **Exercise the extraction path** on real scanned documents. It has never run against
  one, and the confidence threshold that decides what a human re-checks is a guess.
- **Migrate the original data first.** Export the Supabase tables *before* the old site
  is taken down, and keep the export as evidence for the breach assessment.

## The original site

`bbcmlegal.net` is still live and still serves every firm's data with no login.
Deploying this does not change that. It needs to be taken down or gated separately, and
that job is more urgent than this one.
