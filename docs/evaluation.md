# Evaluation methodology

The evaluation dataset contains 24 versioned questions spanning attendance, examinations, AI usage, privacy, placement, and faculty duties. Expected evidence identifies policy/version/section and acceptable answer facts; it is not sent to the model during generation.

## Compared modes

1. `no_rag` (`openai_without_rag` in storage): OpenAI receives only the question and a safe instruction. This establishes the unsupported-answer baseline.
2. `rag` (`openai_with_rag`): scoped vector and full-text retrieval, reciprocal-rank fusion, citations, and grounded generation, without query rewriting, reranking, or reflection.
3. `agentic_self_reflection` (`rag_agents_reflection`): rewritten query, hybrid retrieval, MMR/reranking, grounded generation, and an evidence-only self-reflection correction when quality is below 0.80.

## Metrics

- Retrieval precision and recall against expected chunk/rule evidence.
- Context relevance and answer relevance on a 0–1 scale.
- Faithfulness: supported answer claims divided by all verifiable claims.
- Citation correctness: citations resolving to evidence that supports the adjacent claim.
- Change- and conflict-detection precision/recall/F1.
- Unsupported-claim rate.
- End-to-end and retrieval latency.
- Input, output, total tokens, and estimated cost.

Each result stores metric version, prompt version, model, dataset version, timestamp, and a trace-ID field when a trace identifier is available. Scores must be compared on the same dataset revision.

`npm run evaluate` validates the versioned local dataset without calling OpenAI. With a configured service role, `npm run evaluate -- --enqueue --organization <uuid> --user <uuid>` queues the persisted three-mode run; the bounded worker evaluates one question/mode item per leased job. Dashboard/API runs may also include a comparison ID so the final comparison report can include that run's evaluation summary.

## Evaluation report template

See `evaluation/report-template.md`. Report both aggregate and per-category metrics, confidence intervals when repeated, failures, and examples. Never report a single average without unsupported-claim and citation results.
