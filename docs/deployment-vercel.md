# Supabase and Vercel deployment

PolicyPulse AI deploys as one Vercel project. Supabase is used only for Auth, PostgreSQL/pgvector, private Storage, and vector/full-text RPCs.

## 1. Create Supabase

Create a Supabase project in the region closest to the intended Vercel region. Record the project URL, publishable key, and secret key from the API settings. Never place the secret key in a `NEXT_PUBLIC_` variable.

## 2. Obtain the transaction-pooler URL

Copy the transaction-pooler connection string from Supabase database connection settings. Use it for `DATABASE_URL`; replace the password placeholder locally or in Vercel’s encrypted environment settings. The application disables prepared statements and uses a small connection pool.

The internal worker uses this connection for atomic job claim, heartbeat, completion, and failure transitions. Tenant-facing reads and writes continue through Supabase clients/RPCs so Auth and RLS remain the application boundary.

## 3. Apply migrations and pgvector

Install the Supabase CLI, authenticate, link the project, then run migrations in filename order:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The first migration creates `extensions.vector` and the required types, tables, functions, constraints, FTS GIN index, vector HNSW index, update triggers, and job/checkpoint support.

## 4. Confirm private Storage

The migration creates the private `policy-documents` bucket and its RLS policies. Confirm **Public bucket** is disabled. Object paths are `{organization_id}/{document_id}/{safe_filename}`. Do not create an equivalent Vercel Blob store.

## 5. Verify RLS

Run the SQL tests in `supabase/tests`. Verify:

- department users cannot read unrelated department documents;
- auditors cannot mutate findings;
- only administrators can read usage or manage membership;
- policy managers can upload and decide approvals;
- service-created evidence remains readable only through organization scope;
- audit and approval decision rows cannot be changed or deleted.

## 6. Configure local variables

Copy the template and fill local values:

```bash
cp .env.example .env.local
```

Required for the full workflow are `OPENAI_API_KEY`, Supabase URL/publishable/secret keys, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, and LangSmith credentials. `.env.local` is ignored by Git and Graphify.

## 7. Verify Graphify

Follow `docs/graphify-setup.md` and `docs/graphify-workflow.md`. On Windows this repository uses:

```powershell
.\.graphify-venv\Scripts\graphify.exe extract . --code-only
.\.graphify-venv\Scripts\graphify.exe cluster-only . --no-label
.\.graphify-venv\Scripts\graphify.exe export html
.\.graphify-venv\Scripts\graphify.exe export callflow-html
```

Keep `.graphify-venv/` and `graphify-out/` out of the Vercel upload.

## 8. Seed development data

For a fresh non-production environment:

```bash
supabase db reset
```

For a linked disposable demo project, execute `supabase/seed.sql` through the SQL editor after migrations. Sample policy files live in `sample-policies/`; upload them through the application so extraction, embeddings, and audit events are exercised. Never run demo seed scripts against an established production organization.

## 9. Create the GitHub repository

Initialize or connect the repository, review staged files for secrets, and push the default branch:

```bash
git remote add origin https://github.com/YOUR_ORG/policypulse-ai.git
git add .
git commit -m "Build PolicyPulse AI"
git push -u origin main
```

GitHub Actions runs install, type checking, lint, dependency boundaries, tests, and a production build. Put test-only secrets in GitHub environment secrets only when integration tests are enabled.

## 10. Import into Vercel

In Vercel, choose **Add New → Project**, import the GitHub repository, keep the detected Next.js framework, and use:

- Install: `npm ci`
- Build: `npm run build`
- Output: Next.js default
- Node.js: a current supported LTS version

Do not add another backend project.

## 11. Add Vercel variables

Configure the keys from `.env.example` for Production and Preview as appropriate. Use a separate Supabase project for untrusted previews. Generate `CRON_SECRET` with at least 32 cryptographically random bytes. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin for each environment.

After changing a `NEXT_PUBLIC_` value, redeploy because it is inlined at build time.

## 12. Configure Supabase Auth URLs

In Supabase Auth URL configuration, set the production Site URL to the canonical Vercel domain. Add redirect URLs for:

```text
http://localhost:3000/auth/callback
https://YOUR_PRODUCTION_DOMAIN/auth/callback
https://YOUR_PREVIEW_PATTERN/auth/callback
```

Keep preview patterns as narrow as operationally practical. Configure email templates to return to `/reset-password` and `/auth/callback` on the trusted site.

## 13. Deploy and migrate safely

Apply backward-compatible database migrations before deploying code that requires them. Deploy from the protected default branch. Vercel reads `vercel.json` to configure the cron tick and bounded function duration.

The tracked cron runs once per minute and processes one leased job per invocation. Choose a Vercel plan that supports the configured cron frequency; if the selected plan permits a lower frequency, change the schedule and expect proportionally higher queue latency. Keep `CRON_SECRET` configured because the handler verifies a timing-safe bearer token for both scheduled and manual recovery ticks.

Run the smoke test after deployment:

1. Register or invite each role.
2. Upload a sample old/new pair via signed URL.
3. Observe extraction through Indexed.
4. Ask a cited assistant question.
5. Start a comparison and refresh during execution.
6. Verify a High/Critical result pauses in approvals.
7. Resume with approve and request-revision paths.
8. Update a department action.
9. Download Markdown and PDF reports.
10. Verify Auditor is read-only and unrelated departments are isolated.

## 14. Monitoring and operations

Use Vercel function logs for request-level failures, LangSmith for redaction-aware traces, `ai_usage_logs` for tokens/cost/latency, `workflow_runs` and `background_jobs` for stalled work, and `audit_logs` for governance. Alert on expired leases, repeated retries, unsupported-claim rate, failed ingestion, and unusual cost.

## Troubleshooting

### Build succeeds but auth always redirects

Confirm the public Supabase URL/key were present during build and that callback domains match exactly. Inspect session cookies and the active organization membership; roles are not read from editable user metadata.

### Database connection errors on Vercel

Use the transaction-pooler URL, not a local or direct IPv6-only URL. Ensure SSL is enabled, prepared statements remain disabled, and the database password is URL-encoded.

### Upload completes but indexing fails

Check private object existence, file magic bytes, declared versus actual size/hash, extraction error, OpenAI embedding access, and the 1536-dimension column. Retry through the document process endpoint; do not edit status manually.

### Workflow remains queued

Confirm `CRON_SECRET` matches, Vercel Cron is active for the production deployment, `next_attempt_at` is due, and no live lease owns the job. Expired leases are reclaimable.

### Vector search errors

Verify `extensions.vector` exists, embeddings have exactly 1536 values, and migration indexes/RPCs were applied. Small datasets may not use the HNSW index in query plans; that is expected.

### Graphify output is stale

Run `graphify update .` after source-only changes. Re-run extraction and clustering after broad deletions or when documentation semantics matter. Graphify is a development tool; its absence never changes the production runtime.

## Release evidence boundary

A local production build proves compilation and Vercel-compatible route generation, not a cloud deployment. A release is complete only after `supabase db push`, `supabase test db`, a successful Vercel Production deployment, and the role/isolation/workflow smoke test above have all run against the intended environment. Record the deployment URL, commit, migration head, and smoke-test timestamp in the release record.
