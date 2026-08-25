# Graphify development workflow

PolicyPulse AI uses Graphify as a development-only repository knowledge graph. It helps reviewers trace how UI routes, API boundaries, Supabase tables, RAG tools, agents, workflow nodes, approvals, evaluation, and audit code connect. It is not imported by the deployed application.

## Verified installation

This repository was configured against the official `Graphify-Labs/graphify` release **0.9.49**. The PyPI package is `graphifyy`; the command is `graphify`. Python 3.10 or newer is required.

For this Windows workspace, Graphify is isolated from the application in a local virtual environment:

```powershell
python -m venv .graphify-venv
.\.graphify-venv\Scripts\python.exe -m pip install "graphifyy[sql]==0.9.49"
.\.graphify-venv\Scripts\graphify.exe --version
.\.graphify-venv\Scripts\graphify.exe install --project --platform codex
```

The project install creates `.codex/skills/graphify/`, updates `AGENTS.md`, and registers the project hook. `.graphify-venv/` is ignored by Git and Vercel.

Official source: <https://github.com/Graphify-Labs/graphify>

## Exclusions

`.graphifyignore` uses gitignore syntax and excludes at least:

```text
.env
.env.local
.env.production
.env.development
.env.test
node_modules/
.next/
coverage/
dist/
build/
out/
.git/
.graphify-venv/
graphify-out/
reports/
tmp/
```

Graphify also respects `.gitignore`. `.env.example` contains names only and is intentionally safe to analyze. Never put credentials or real policy files containing restricted data in tracked output.

## Commands used

The deterministic offline repository mapping sequence is:

```powershell
.\.graphify-venv\Scripts\graphify.exe extract . --code-only
.\.graphify-venv\Scripts\graphify.exe cluster-only . --no-label
.\.graphify-venv\Scripts\graphify.exe export html
.\.graphify-venv\Scripts\graphify.exe export callflow-html
```

`extract` intentionally stops before clustering in the current CLI. There is no `graphify report` command; `cluster-only` creates the report. SQL parsing is enabled through the `[sql]` extra.

After source changes:

```powershell
.\.graphify-venv\Scripts\graphify.exe update .
```

`update` is AST/code-only. A semantic refresh of documentation uses the installed Codex `$graphify . --update` workflow or another supported semantic backend. Do not invent an OpenAI-backed Graphify command from an older release; current project guidance controls semantic extraction.

## Output artifacts

Supported primary artifacts are:

- `graphify-out/graph.json`: GraphRAG-ready JSON.
- `graphify-out/GRAPH_REPORT.md`: architecture report, communities, central nodes, connections, and suggested questions.
- `graphify-out/graph.html`: interactive graph.
- `graphify-out/Policy-Pulse-AI-callflow.html`: architecture/call-flow export.

Supporting manifest, cache, label, analysis, build, and cost JSON may also appear. The exact call-flow prefix follows the detected project name. `graphify-out/` is development output and is excluded from the Vercel upload.

## Refresh cadence

Refresh the graph after each major development phase, after moving a module boundary, and before a cross-module architecture change. A full extract is required when broad file deletion intentionally shrinks the graph or when documentation semantics must be rebuilt.

## Architecture queries

Run focused queries before opening the full report:

```powershell
.\.graphify-venv\Scripts\graphify.exe query "Which routes bypass the authorization layer?" --context app/api --context lib/auth
.\.graphify-venv\Scripts\graphify.exe query "Which agents bypass tracked OpenAI calls?" --dfs --budget 4000
.\.graphify-venv\Scripts\graphify.exe query "How does an approval decision resume a workflow?"
.\.graphify-venv\Scripts\graphify.exe path "ChatRoute" "HybridRetriever"
.\.graphify-venv\Scripts\graphify.exe explain "PolicyAnalysisGraph"
.\.graphify-venv\Scripts\graphify.exe affected "HybridRetriever" --relation CALLS --depth 3
.\.graphify-venv\Scripts\graphify.exe god-nodes --top 20
```

Useful review questions include:

- Does any Client Component import a server-only OpenAI, database, or admin Supabase module?
- Do all AI operations pass through the tracked OpenAI wrapper?
- Do all workflow nodes persist artifacts and checkpoints?
- Can any approval, action, or audit mutation bypass authorization?
- Are retrieval, risk scoring, and reporting responsibilities duplicated?
- Are file-routed pages or Route Handlers absent from the expected architecture?

Graphify treats Next.js source as TypeScript/TSX and does not fully understand App Router conventions. A route with no inbound import can still be live. Graph findings therefore complement, rather than replace, TypeScript, ESLint, dependency-cruiser, tests, and production builds.

## How findings influence architecture

The intended dependency direction is `app/components → API/server services → repositories → managed providers`, while AI and workflow modules remain independent of UI. Central-node findings are reviewed for accidental “god modules.” Cycle and unused-module claims are confirmed with `npm run deps:check`, TypeScript, and route awareness before code is removed or moved.

## Final repository audit

The final AST refresh and clustering on 2026-08-25 produced **1,557 nodes, 3,350 edges, and 171 communities**. `diagnose multigraph --json` reported zero missing/dangling endpoints, self-loops, exact duplicates, or relation/source/context variant groups; the post-build graph remained a normal 1,557-node/3,350-edge graph.

The highest-degree nodes were the intended shared boundaries: `createServerSupabaseClient()` (77), the JSON response helper (69), `apiRoute()` (60), and the UI data-normalization helper `firstString()` (50). They centralize session/RLS access, secure API behavior, and compatibility normalization rather than mixing business responsibilities. `npm run deps:check` independently traversed 161 modules/370 dependencies with no cycle or boundary violation.

The approval-resume query surfaced the approval UI, workflow state/graph, durable saver, materializer, worker, and resume tests in the same scoped neighborhood. Because App Router files are entrypoints rather than imported callers and SQL RPC edges are only partially modeled, the exact UI → decision Route Handler → transactional RPC → queued worker → `advancePolicyWorkflow()` path was also verified from source and tests instead of treating an absent graph edge as dead code.
