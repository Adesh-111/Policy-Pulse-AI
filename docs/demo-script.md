# Ten-minute demo script

## 0:00–0:45 — Problem and promise

Open the landing page. Explain that policy changes are usually reviewed manually across PDFs, departments, and deadlines. PolicyPulse turns a version pair into cited changes, risks, actions, approvals, and an auditable report.

## 0:45–1:30 — Roles and security

Sign in as Policy Manager. Show the role badge and navigation. Mention Supabase Auth, server-side membership checks, RLS, private Storage, signed URLs, and the fact that uploaded text is treated as evidence rather than instruction.

## 1:30–2:45 — Upload and index

Upload the old and new Attendance policies from `sample-policies/`. Point out metadata, old/new designation, department grants, and checksum. Show the real processing states: Uploaded, Extracting, Chunking, Embedding, Indexed. Explain 800/120 chunks, 1536-dimensional embeddings, and PostgreSQL FTS.

## 2:45–4:00 — Hybrid RAG assistant

Ask: “What changed in the attendance requirement and medical exemption?” Show query rewrite, vector + FTS retrieval, fusion/rerank, streamed answer, and source cards with title/version/page/section/snippet. Ask an unsupported question and show the insufficient-evidence response.

## 4:00–5:30 — Agentic comparison

Create an old/new comparison. On progress, describe the 12-node LangGraph workflow and nine specialized agents. Refresh the page mid-run to demonstrate persisted state. Open results and inspect the 75% → 80% modification, exception change, affected departments, risk, confidence, and both citations.

## 5:30–6:30 — Conflict and risk

Open Conflict Explorer and show the conditional AI-assignment allowance conflicting with a prohibition in another policy. Open Risk Dashboard and explain deterministic risk levels plus AI rationale, confidence, and citation validation.

## 6:30–7:40 — Human approval and revision

Open the High/Critical approval item. Inspect evidence and plan. Request a revision with a note; show the new analysis version and preserved history. Approve the revised result. Explain LangGraph interrupt/resume and durable checkpoints.

## 7:40–8:30 — Department action plan

Switch to a Department User. Show only the authorized plan. Update one item to In Progress and another to Complete. Point out owner, due date, success criterion, and audit record.

## 8:30–9:10 — Reports and governance

Open the final report, then download Markdown and PDF. Show approval history, citations, evaluation metadata, and timestamp. Switch to Auditor and demonstrate read-only evidence and audit access.

## 9:10–10:00 — Evaluation, cost, and architecture

As Administrator, compare no-RAG, RAG, and agentic/self-reflection metrics. Show tokens, latency, estimated cost, and unsupported-claim rate. Close with the one-project Vercel architecture, Supabase durable state, LangSmith tracing, GitHub CI, and Graphify repository map.
