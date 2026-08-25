# Development and release log

This is the consolidated implementation record for PolicyPulse AI. The project was built in seven requirement-aligned phases and then passed an integrated release audit. Because the repository was produced in one assisted build session, the authoritative acceptance evidence is the final full-repository gate, not a claim that an externally deployed environment existed after each intermediate file group.

## Blueprint used before implementation

The design is one Next.js App Router deployment on Vercel. Browser requests pass through Supabase Auth, server session validation, route-level role checks, Zod validation, and database RLS. Supabase owns PostgreSQL/pgvector, private Storage, authentication, durable job leases, workflow state, and LangGraph checkpoints. OpenAI calls use one tracked server-only client; LangSmith receives redaction-aware trace metadata.

```text
app/                 pages, layouts, auth actions, and Route Handlers
components/          role-aware application UI
lib/ai/              nine agent contracts, prompts, schemas, tools, runner
lib/documents/       extraction, section detection, chunking, staged indexing
lib/rag/             hybrid retrieval, MMR, reranking, citations, chat
lib/workflows/       LangGraph state, nodes, routing, persistence, materializers
lib/jobs/            leased resumable Vercel job queue and worker
lib/openai/          Responses/Embeddings client and usage accounting
lib/reports/         on-screen, Markdown, and PDF report generation
lib/evaluation/      dataset, three variants, metrics, runner
supabase/            schema, RPC, RLS, Storage, seed, and pgTAP SQL
tests/               unit, component, API-contract, auth, workflow, integration
evaluation/          24-question versioned corpus and report template
sample-policies/     six realistic old/new policy pairs
docs/                architecture, security, workflow, testing, and deployment
graphify-out/        development-only repository graph artifacts
```

The detailed schema, RLS matrix, 12-node graph, nine agent definitions, API inventory, and Graphify procedure are recorded in [database-diagram.md](database-diagram.md), [rls.md](rls.md), [langgraph-workflow.md](langgraph-workflow.md), [api.md](api.md), and [graphify-workflow.md](graphify-workflow.md).

## Phase 1 — platform, identity, database, and shell

Created or established:

- Root configuration: `.env.example`, `.gitignore`, `.nvmrc`, `next.config.ts`, `proxy.ts`, `package.json`, `vercel.json`, and GitHub Actions.
- Application foundation: `app/layout.tsx`, `app/globals.css`, landing/error/not-found/metadata files, auth route group, dashboard route group, and `components/shell/*`.
- Identity and tenancy: `lib/auth/*`, `lib/supabase/*`, `lib/api/*`, `lib/security/*`, and `lib/audit/log.ts`.
- Database foundation: migrations `001`–`006`, `supabase/seed.sql`, and SQL tests `001`–`003`.
- Documentation foundation: architecture and database diagrams plus RLS plan.

The initial Graphify map was configured with secret, dependency, build, and generated-output exclusions.

## Phase 2 — protected document ingestion

Created or modified:

- `components/policies/upload-policy-form.tsx`, policy library/detail components, and document pages.
- Document upload, completion, status, processing, and signed-download Route Handlers under `app/api/v1/documents/`.
- `lib/documents/chunk.ts`, `extract.ts`, `ingestion.ts`, `supabase.ts`, and `types.ts`.
- `lib/jobs/queue.ts` and `worker.ts` for durable extraction and 32-chunk embedding batches.
- Private Storage/RLS, immutable tenant paths, byte/MIME/magic/size/SHA-256 checks, processing-state transitions, duplicate detection, and 1536-dimensional vectors.
- `tests/unit/documents.test.ts` and document API contracts.

The release audit added generation-stable embedding batches and lease heartbeats so indexing does not require one long uninterrupted Vercel invocation.

## Phase 3 — hybrid RAG and policy assistant

Created or modified:

- `lib/rag/*` for query rewriting, vector and PostgreSQL FTS retrieval, reciprocal-rank fusion, dedupe, MMR, reranking, canonical citations, and insufficient-evidence behavior.
- `lib/openai/*` for tracked Responses and Embeddings operations with timeout, retry, usage, cost, latency, and safe errors.
- `app/api/v1/chat/route.ts`, chat-session routes, and `components/assistant/policy-chat.tsx`.
- `tests/unit/rag-algorithms.test.ts`, `rag-pipeline.test.ts`, OpenAI mock tests, and component source-card coverage.

Streamed answers now expose only canonical citations whose authorized source labels appear in the completed answer; invalid or absent support fails closed to the specified insufficient-evidence response.

## Phase 4 — agents, comparison, and LangGraph

Created or modified:

- `lib/ai/agents.ts`, `prompts.ts`, `schemas.ts`, `tools.ts`, and `runner.ts` for nine structured agents and executable bounded ReAct-style tools.
- `lib/workflows/state.ts`, `graph.ts`, `nodes.ts`, `routing.ts`, `evidence.ts`, `agent-tools.ts`, `factory.ts`, and `persistence.ts`.
- Comparison creation/start/progress/findings APIs and comparison/progress/results/conflict/risk pages.
- Database findings, risks, workflow runs, checkpoints, leases, hybrid-search RPC, and workflow RPCs.
- Workflow, agent-tool, citation, routing, resume, and cross-policy evidence tests.

The graph advances one bounded node per job, persists normalized state plus full LangGraph checkpoints, retries evidence and quality paths within configured caps, and can resume after a process restart.

## Phase 5 — approval, actions, reports, and audit

Created or modified:

- Approval queue/detail/decision APIs and role-aware UI.
- Action-plan list/update APIs and department progress UI.
- `lib/workflows/materializer.ts` for idempotent normalized projections and revision replacement.
- `lib/reports/*` plus report view and artifact-download routes.
- Audit and governance administration pages.
- Approval/RLS and report tests.

High/Critical or exhausted-review states interrupt durably. Decisions are append-only and optimistic-version guarded. Final Markdown and PDF artifacts are versioned, private, and constrained to their exact organization/comparison Storage prefix.

## Phase 6 — evaluation, usage, and security hardening

Created or modified:

- `evaluation/questions.json`, `evaluation/report-template.md`, `lib/evaluation/*`, evaluation API/UI, and `scripts/evaluate.ts`.
- Administrator usage/cost dashboard and tracked usage fields.
- Six old/new policy pairs under `sample-policies/`.
- Migrations `007`–`011` for comparison visibility, invitation acceptance, atomic starts/retries/membership/checkpoints, evaluation version metadata, report scope, terminal-run protection, and immutable evaluated-question identity.
- `supabase/tests/004_security_integrity_test.sql` and static integrity contracts.
- Security headers, origin validation, persistent rate limiting, prompt-injection handling, canonical citations, and service-only mutation boundaries.

The dataset validator confirms 24 questions across eight categories and three evaluation variants. Automated tests use mocked OpenAI transports.

## Phase 7 — architecture and release audit

Final integrated checks cover:

- TypeScript with no emit.
- ESLint with zero warnings.
- Dependency-cruiser module boundaries and cycles.
- Vitest unit, component, API-contract, auth, workflow, and static integration suites.
- Dataset/schema validation without live OpenAI traffic.
- Next.js production compilation and route generation.
- Secret and unfinished-placeholder scans plus Git whitespace validation.
- Graphify incremental update, clustering, report, graph JSON, interactive HTML, call-flow HTML, central-node review, and multigraph diagnosis.

The local environment does not include the Supabase CLI, Docker, `psql`, cloud credentials, or a Vercel account session. Consequently, pgTAP against a live local Supabase stack, real OpenAI/Supabase end-to-end smoke tests, lock-contention tests with multiple database sessions, and the final Vercel production deployment remain environment-owner release steps. Exact commands and smoke cases are in [testing.md](testing.md) and [deployment-vercel.md](deployment-vercel.md); no live deployment is claimed by this log.

The final Graphify refresh contains 1,557 nodes, 3,350 edges, and 171 communities. Its multigraph diagnostic found no malformed, dangling, self-loop, or duplicate edges, and the generated JSON, report, interactive graph, and 17-section call-flow artifact are present under `graphify-out/`.
