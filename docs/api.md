# API documentation

All application APIs use JSON unless documented otherwise. Protected endpoints require a valid Supabase session cookie. Mutations validate `Origin`, apply database-backed rate limits where expensive, re-check the organization role, and write audit events. Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request did not pass validation.",
    "requestId": "uuid",
    "details": {}
  }
}
```

Responses include `x-request-id` and `cache-control: no-store`.

## Documents

| Method | Route | Roles | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/documents` | All roles | Authorized, paginated policy library |
| `POST` | `/api/v1/documents/upload-url` | Administrator, Policy Manager | Validate metadata, reserve a document, return a signed direct-upload URL |
| `POST` | `/api/v1/documents/{id}/upload-complete` | Administrator, Policy Manager | Confirm upload and queue ingestion |
| `GET` | `/api/v1/documents/{id}` | Authorized roles | Policy metadata and processing status |
| `PATCH` | `/api/v1/documents/{id}` | Administrator, Policy Manager | Update safe metadata |
| `DELETE` | `/api/v1/documents/{id}` | Administrator, Policy Manager | Soft-delete policy metadata |
| `GET` | `/api/v1/documents/{id}/download-url` | Authorized roles | Short-lived private download URL |
| `GET` | `/api/v1/documents/{id}/download` | Authorized roles | Redirect to a short-lived private download URL |
| `POST` | `/api/v1/documents/{id}/process` | Administrator, Policy Manager | Idempotently retry ingestion |

The browser uploads bytes directly to Supabase Storage. `upload-complete` does not trust the browser's original declaration; the ingestion job downloads the object, checks magic bytes, size, hash, emptiness, and extraction integrity, stages chunks, and queues resumable 32-chunk embedding jobs before marking the document Indexed.

## Search and assistant

| Method | Route | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/v1/chat/sessions` | List or create a chat session |
| `GET/DELETE` | `/api/v1/chat/sessions/{id}` | Read or delete an owned session |
| `POST` | `/api/v1/chat` | Stream a grounded answer and final source cards |

Chat streams UTF-8 `text/event-stream` payloads with `session`, `sources`, `text-delta`, `done`, or `error` types, followed by `data: [DONE]`. Retrieval is internal to the chat route and applies document, department, version, and category filters before generation. A stored assistant message is committed only after generation completes.

## Comparisons and workflow

| Method | Route | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/v1/comparisons` | List comparisons or create a validated old/new pair |
| `GET` | `/api/v1/comparisons/{id}` | Versioned findings and summary |
| `POST` | `/api/v1/comparisons/{id}/start` | Queue or idempotently resume the LangGraph run |
| `GET` | `/api/v1/comparisons/{id}/progress` | Workflow state, node timeline, and safe errors |
| `GET` | `/api/v1/comparisons/{id}/changes` | Cited change findings |
| `GET` | `/api/v1/comparisons/{id}/conflicts` | Cited cross-policy conflicts |
| `GET` | `/api/v1/comparisons/{id}/risks` | Risk assessments |
| `GET/POST` | `/api/v1/workflows/{runId}` | Read durable checkpoints or idempotently requeue a retryable run |

## Approvals, actions, and reports

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/approvals` | Approval queue scoped by role |
| `GET` | `/api/v1/approvals/{id}` | Findings, citations, plan, and history |
| `POST` | `/api/v1/approvals/{id}/decisions` | Append approve/reject/revision decision and resume graph |
| `GET` | `/api/v1/action-plans` | Authorized department plans |
| `PATCH` | `/api/v1/action-plans/{planId}/items/{itemId}` | Update progress with an audit event |
| `GET` | `/api/v1/reports/{comparisonId}` | On-screen report model with the applicable evaluation summary |
| `GET` | `/api/v1/reports/{comparisonId}/download?format=md\|pdf` | Retrieve the latest prebuilt, versioned private artifact without mutating state |

Print uses the results page's browser print view. Approval decisions and audit entries are append-only. Revision creates a new analysis version, replaces the current normalized projections, and retains durable checkpoints and versioned reports for history.

## Evaluation and administration

| Method | Route | Roles | Purpose |
| --- | --- | --- | --- |
| `GET/POST` | `/api/v1/evaluations` | Administrator, Policy Manager (`POST`); Auditor also `GET` | Results or queued three-mode evaluation; `comparisonId` may associate a run with a report |
| `GET` | `/api/v1/usage` | Administrator | OpenAI calls, tokens, cost, latency, failures |
| `GET` | `/api/v1/audit-logs` | Administrator, Auditor | Paginated immutable audit trail |
| `GET/POST` | `/api/v1/users` | Administrator | Membership list or invitation |
| `PATCH` | `/api/v1/users/{id}/membership` | Administrator | Role/status/department grants |
| `GET/POST` | `/api/v1/departments` | Administrator for writes | Department directory |
| `GET/PATCH` | `/api/v1/settings` | Administrator for writes | Retrieval, quality, and workflow settings |

## Internal worker

`GET /api/internal/jobs/tick` accepts only `Authorization: Bearer <CRON_SECRET>` (including Vercel Cron). It ignores arbitrary user-supplied workflow IDs, claims due jobs through a PostgreSQL lease, and performs bounded work. It is not a public workflow endpoint.
