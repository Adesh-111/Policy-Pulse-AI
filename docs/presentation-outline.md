# Presentation outline

## 1. Title

PolicyPulse AI — Agentic Policy Change Impact and Compliance Planner.

## 2. Problem

Policy versions are long, ambiguous, cross-departmental, and difficult to audit. Manual review misses changed thresholds, exceptions, conflicts, ownership, and deadlines.

## 3. Product outcome

Upload old/new policies; receive cited changes, conflicts, affected departments, risk, action plans, approvals, grounded answers, reports, and audit history.

## 4. User roles

Administrator, Policy Manager, Department User, and Auditor. Explain least privilege across UI, API, RLS, and Storage.

## 5. Architecture

One Next.js/Vercel project; Supabase Auth/PostgreSQL/pgvector/Storage; OpenAI; LangChain/LangGraph; LangSmith; Vercel Cron; GitHub Actions; Graphify development graph.

## 6. Secure ingestion

Signed direct upload, file/hash validation, extraction, 800/120 chunking, section/page metadata, 1536-dimensional embeddings, and private indexed storage. Policy text is untrusted evidence.

## 7. Hybrid RAG

Query rewrite → vector + full-text → RRF → dedupe → MMR → rerank → grounded answer → citation validation. Show insufficient-evidence behavior.

## 8. Agents and LangGraph

Nine structured agents and 12 workflow nodes. Emphasize bounded tools, structured outputs, retry limits, persisted checkpoints, and no exposed chain-of-thought.

## 9. Change, conflict, and risk intelligence

Examples: attendance 75% → 80%, medical exemption changes, AI-use conflict, placement CGPA change, examination deadline, responsibility, and retention period.

## 10. Self-reflection and human approval

Quality scores for evidence, citations, completeness, false conflicts, risk, actions, and hallucinations. Automatic revision below 0.80, maximum two, High/Critical interrupt and append-only decisions.

## 11. Department execution and reports

Owned/date-bound actions, progress tracking, Markdown/PDF/print report, approval history, evidence, evaluations, and audit records.

## 12. Evaluation

At least 20 questions; no RAG vs RAG vs agentic/reflection; retrieval, relevance, faithfulness, citations, detection accuracy, unsupported claims, latency, tokens, and cost.

## 13. Production readiness

Vercel-compatible bounded jobs, transaction pooler, RLS tests, mocked OpenAI tests, secure headers/errors/rate limits, usage dashboard, LangSmith traces, CI, and Graphify architecture audit.

## 14. Live demo and conclusion

Run the ten-minute script. Conclude that PolicyPulse converts policy documents into evidence-backed organizational execution while retaining human accountability.
