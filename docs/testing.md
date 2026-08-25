# Testing guide

Automated tests never require real OpenAI calls. The tracked OpenAI client accepts an injected SDK/transport; fixtures return structured responses and deterministic embeddings.

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm run deps:check
npm test
npm run evaluate
npm run build
```

Use `npm run test:watch` during development. A complete phase is not accepted until all commands pass.

## Test layers

- Unit: chunking, prompt-injection sanitization, RRF, MMR, citation validation, risk derivation, structured schemas, cost math, and report formatting.
- Component: forms, filters, tables, source cards, role-aware navigation, and streaming chat states.
- API: validation, secure errors, origin checks, rate limits, idempotency, and response contracts.
- Authentication: registration, login, logout, reset callback, session refresh, and protected redirects.
- Authorization: every role/action pair at both API and UI boundaries.
- Retrieval: department/document/version filters, vector + FTS fusion, dedupe, MMR, evidence fallback, and citations.
- LangGraph: every conditional edge, evidence retry cap, two-revision cap, interrupt, resume, duplicate job delivery, and function-restart simulation.
- Approval: optimistic analysis-version guard, append-only decisions, reject/revision routes, and audit events.
- RLS: policies run against local Supabase with role-specific JWT claims; service-only tables remain inaccessible.
- OpenAI: Responses and Embeddings SDK calls are mocked; token, latency, error, and cost logs are asserted.

## Local Supabase integration tests

With Docker and Supabase CLI available:

```bash
supabase start
supabase db reset
supabase test db
```

Run destructive reset commands only against the local project. The SQL tests create isolated users/organizations and roll back fixtures.

Four pgTAP suites cover the schema, RLS/security boundaries, seed fixtures, and release-integrity RPCs/triggers. The idempotency assertions in pgTAP are sequential because one pgTAP connection cannot create genuine lock contention. In CI or a staging database, also issue two simultaneous workflow-start and retry requests from separate authenticated database sessions and assert one active run/job; keep this destructive concurrency check outside production.

## Last local release gate

On 2026-08-25, the integrated repository passed:

- TypeScript.
- ESLint with zero warnings.
- Dependency-cruiser: 161 modules and 370 dependencies, no violations.
- Vitest: 18 files and 57 tests.
- Evaluation dataset validation: version 1.0.0, 24 questions.
- Next.js 16.3.2 production build: 26 static-generation entries and all documented dynamic routes compiled.

The host did not have Supabase CLI, Docker, or `psql`, so the four SQL suites were not executed here. Run them before promoting a real Supabase project.

## Production smoke test

After Vercel deployment, use a dedicated demo organization. Exercise direct upload, extraction, hybrid chat, workflow refresh/restart, human pause/resume, revision, report download, department isolation, Auditor read-only behavior, usage records, and audit history. Do not run smoke tests with confidential policies.

## Acceptance gates

- No unmocked OpenAI call in automated CI.
- No secret in client bundles, snapshots, logs, Graphify output, or fixtures.
- No unsupported assistant claim; insufficient evidence uses the exact fallback.
- All source cards reference an authorized chunk and include document, version, section, snippet, and page when available.
- Workflow state survives process teardown between steps.
- `npm run build` completes with no environment secrets present at build time.
