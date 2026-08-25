# PolicyPulse AI

**Agentic policy change impact and compliance planner**

PolicyPulse AI lets a college or organization upload old and new policy documents, index them with hybrid retrieval, detect cited rule changes and conflicts, assess department impact and risk, produce action plans, pause high-risk findings for approval, answer policy questions with evidence, and retain a complete audit trail.

This repository is a production-oriented GenAI capstone built as one Next.js application for Vercel. Supabase provides Auth, PostgreSQL/pgvector, and private Storage; there is no separate backend.

## Capabilities

- PDF, DOCX, TXT, and Markdown ingestion through signed private uploads.
- Byte, MIME, size, checksum, duplicate, corruption, and metadata validation.
- 800-token chunks with 120-token overlap and `text-embedding-3-small` vectors.
- PostgreSQL full-text + pgvector search, reciprocal-rank fusion, MMR, reranking, and citations.
- Streaming RAG chat with document, department, and version filters.
- LangGraph policy-analysis workflow with 12 nodes, durable checkpoints, retries, reflection, revision, and human interrupts.
- Nine schema-constrained agents using the official OpenAI Node SDK.
- Added, removed, modified, deadline, responsibility, eligibility, exception, and compliance-change detection.
- Cross-policy conflict, ambiguity, implementation-gap, department impact, and Low/Medium/High/Critical risk analysis.
- Department action plans, approval history, Markdown/PDF/print reports, audit records, and AI usage/cost tracking.
- Four roles enforced in UI, API, RLS, and private Storage policies.
- Three-mode evaluation: no RAG, RAG, and agentic RAG with self-reflection.
- Graphify repository graph, report, interactive visualization, GraphRAG JSON, and call-flow output.

## Required stack

Next.js 16 App Router, TypeScript, React 19, Tailwind CSS 4, Route Handlers, Vercel Functions/Cron, Supabase Auth/PostgreSQL/Storage/RLS/pgvector, OpenAI SDK, LangChain.js, LangGraph.js, LangSmith, Zod, Recharts, Vitest, Testing Library, Graphify, GitHub Actions, and Vercel.

The default models remain the user-requested `gpt-4.1-mini` and `text-embedding-3-small`. They are environment-configurable.

## Architecture

```text
Browser
  → Next.js App Router on Vercel
    → Supabase Auth + RLS
    → PostgreSQL + pgvector + full-text search
    → private Supabase Storage
    → OpenAI Responses + Embeddings
    → LangSmith traces

Vercel Cron
  → authenticated bounded job tick
  → transaction-pooler leased PostgreSQL job
  → one idempotent ingestion/workflow/evaluation/report step
  → persisted artifacts + LangGraph checkpoint
```

See [architecture](docs/architecture.md), [workflow](docs/langgraph-workflow.md), and [database diagram](docs/database-diagram.md).

## Roles

| Role | Effective permissions |
| --- | --- |
| Administrator | Organization-wide policies/analyses, membership/role/department management, audit, settings, and AI usage |
| Policy Manager | Upload, compare, review, approve/reject/revise, action plans, and reports |
| Department User | Authorized policies, department actions/progress, and assistant |
| Auditor | Read-only comparisons, evidence, approvals, evaluation, and audit |

Roles are read from authoritative organization memberships, never from user-editable profile metadata.

## Local setup

### Prerequisites

- Node.js 22 LTS or another Next.js-supported LTS release.
- npm.
- Python 3.10+ for Graphify.
- Supabase project or local Supabase CLI/Docker stack.
- OpenAI API key for live AI operations.
- LangSmith key for hosted tracing.

### Install

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` without committing it:

```env
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=policypulse-ai
LANGSMITH_TRACING=true
```

Apply migrations and seed a disposable development project:

```bash
supabase db reset
npm run dev
```

Open <http://localhost:3000>. Upload sample policies from `sample-policies/` through the application so real ingestion, embeddings, and audit paths run.

## Graphify

The repository is pinned to Graphify 0.9.49 in a local development virtual environment. On Windows:

```powershell
python -m venv .graphify-venv
.\.graphify-venv\Scripts\python.exe -m pip install "graphifyy[sql]==0.9.49"
.\.graphify-venv\Scripts\graphify.exe install --project --platform codex
.\.graphify-venv\Scripts\graphify.exe extract . --code-only
.\.graphify-venv\Scripts\graphify.exe cluster-only . --no-label
.\.graphify-venv\Scripts\graphify.exe export html
.\.graphify-venv\Scripts\graphify.exe export callflow-html
```

Use `graphify update .` after source changes and query before cross-module architecture work. Exact exclusions, commands, outputs, limitations, and query examples are documented in [the Graphify workflow](docs/graphify-workflow.md).

## Development commands

```bash
npm run dev          # local application
npm run typecheck    # TypeScript
npm run lint         # ESLint, zero warnings
npm run deps:check   # cycles and forbidden dependencies
npm test             # unit/component/workflow tests
npm run evaluate     # validate dataset (add -- --enqueue ... for a live queued run)
npm run build        # Vercel production build
npm run check        # full local gate
```

Automated tests mock OpenAI by default and do not consume API credits.

## Document lifecycle

```text
Uploaded → Extracting → Chunking → Embedding → Indexed
     └──────────────────────────────────────→ Failed
```

Objects remain private. The browser uploads directly to a signed Supabase URL; the ingestion worker independently verifies bytes and checksum. Extraction/sectioning stages chunks first, then 32-chunk embedding jobs resume by a persisted generation/index and renew their database lease. Extracted policy text is delimited as untrusted evidence and cannot override agent system instructions.

## Hybrid retrieval and citations

The assistant rewrites the query, runs organization/department/document/version-scoped vector and full-text searches, fuses results, deduplicates, diversifies with MMR, reranks, and generates only from selected evidence. Citations carry title, version, page when available, section, and snippet. When support is inadequate, the assistant returns:

> I could not find sufficient evidence in the uploaded policies.

## Workflow durability

Workflow state and checkpoints are stored in Supabase. High/Critical risk and exhausted automatic review create an approval interrupt. A reviewer’s append-only decision resumes the same thread. Each Vercel job step is leased, bounded, retryable, and idempotent; a page refresh or function restart cannot erase progress.

## Security

- Server-side `auth.getUser()` validation plus route role guards and RLS.
- Private Storage with short-lived signed URLs.
- Secret modules marked server-only; no OpenAI or Supabase secret in client code.
- Zod validation, origin checks, persistent hashed rate-limit buckets, secure error envelopes, and security headers.
- File extension/MIME/magic-byte/size/hash validation and sanitized immutable paths.
- Prompt-injection detection, untrusted-evidence delimiters, scoped tools, and citation validation.
- Append-only audit and approval decision history.
- Secret/build/dependency exclusions for Git, Graphify, and Vercel.

See [RLS details](docs/rls.md) and [deployment](docs/deployment-vercel.md).

## Evaluation

The versioned dataset in `evaluation/questions.json` measures retrieval precision/recall, context/answer relevance, faithfulness, citation correctness, change/conflict accuracy, unsupported-claim rate, latency, tokens, and estimated cost across three modes. See [methodology](docs/evaluation.md) and the [report template](evaluation/report-template.md).

## Documentation index

- [Architecture](docs/architecture.md)
- [Architecture diagram](docs/architecture-diagram.md)
- [Database diagram](docs/database-diagram.md)
- [LangGraph workflow](docs/langgraph-workflow.md)
- [API reference](docs/api.md)
- [Testing guide](docs/testing.md)
- [Evaluation guide](docs/evaluation.md)
- [Graphify setup](docs/graphify-setup.md)
- [Graphify workflow](docs/graphify-workflow.md)
- [Development log](docs/development-log.md)
- [Vercel deployment](docs/deployment-vercel.md)
- [Ten-minute demo](docs/demo-script.md)
- [Presentation outline](docs/presentation-outline.md)

## Deployment

Push to GitHub, import the repository as one Vercel Next.js project, add encrypted environment variables, apply Supabase migrations, configure Auth redirect URLs, and run the deployment smoke test. No Azure, AWS, Firebase, MongoDB, Vercel Blob, NextAuth, Render, Railway, or separate backend is required.

Full instructions: [Supabase and Vercel deployment](docs/deployment-vercel.md).

The repository's local production build and automated gates are verified. A live Supabase migration/test run and Vercel Production smoke test require the environment owner's credentials and are intentionally not claimed by this source handoff.
