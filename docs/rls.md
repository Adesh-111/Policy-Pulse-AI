# Row Level Security and authorization

All application tables have RLS enabled. The `anon` role has no direct table grants. The `service_role` is reserved for trusted server-side jobs and must never reach a browser. API handlers must still validate the server-side session and input; RLS is the final data boundary, not a replacement for route authorization.

## Authoritative identity model

Supabase Auth owns credentials and sessions. `profiles.id` references `auth.users.id` and stores display fields only. `memberships` owns organization role and primary department. `profile_departments` adds department access without duplicating or weakening the role. Never authorize from `raw_user_meta_data`, a client request body, a cached browser role, or an email-domain assumption.

The one bootstrap exception is intentionally narrow: a self-registration that includes `organization_name` creates a brand-new isolated organization and makes that same new user its administrator. The metadata cannot name an existing organization or choose a role. Invitation metadata omits `organization_name`; an existing administrator attaches the invited user through the membership workflow.

The stable security-definer helpers run with an empty search path and query membership rows while bypassing their own RLS, avoiding policy recursion:

- `is_org_member(organization_id)`
- `has_org_role(organization_id, app_role[])`
- `can_access_department(organization_id, department_id)`
- `can_access_document(document_id)`
- `can_view_comparison(comparison_id)`
- `current_memberships()`

Only their exact signatures are executable by authenticated users. Function ownership must remain with the migration owner; do not transfer these functions to an application role.

## Permission matrix

| Resource | Administrator | Policy Manager | Department User | Auditor |
|---|---|---|---|---|
| Organization and departments | Read/manage | Read | Read | Read |
| Memberships and role grants | Read/manage | Own membership only | Own membership only | Read |
| Policy documents and chunks | Read/manage | Read/manage | Read org-wide or assigned departments | Read |
| Comparisons and evidence | Read/manage | Read/manage | Read authorized department scope | Read only |
| Risk and conflict findings | Read/manage | Read/manage | Read authorized department scope | Read only |
| Action plans | Read/manage | Read/manage | Read own department | Read only |
| Action item progress | Read/manage | Read/manage | Update progress fields in own department | Read only |
| Workflow state/checkpoints/jobs | Read/manage | Read/manage | Comparison progress only when authorized | Read only |
| Approval queue/history | Read/decide | Read/decide | No direct queue access | Read only |
| Chat sessions/messages | Own sessions | Own sessions | Own sessions | Own sessions |
| Evaluation | Read/manage | Read/manage | Read questions | Read results |
| Audit logs | Read only | No direct access | No direct access | Read only |
| AI usage/cost | Read only | No direct access | No direct access | No direct access |
| Settings | Read/manage | Client-visible only | Client-visible only | Client-visible only |

Auditors have no insert, update, or delete policies for findings, workflows, approvals, or audit data. Department-user action updates pass a trigger that rejects changes to assignment, wording, due date, sequence, tenant, or plan linkage; only `status`, `progress_percent`, `completion_notes`, and `completed_at` may change.

Membership identity is immutable, and a trigger prevents removal, demotion, or suspension of the last active administrator in an organization. Transfer administrative responsibility before deleting that user's Auth account.

## Transactional security boundaries

Use these RPCs rather than multi-request writes:

- `create_document_record(...)` checks administrator/policy-manager membership, same-organization active departments, immutable tenant/document Storage prefix, duplicate SHA-256, and inserts document access mappings plus an audit event atomically. Call it through the user's session so `uploaded_by` is meaningful.
- `record_approval_decision(...)` locks the pending request and comparison, checks the expected analysis version, appends decision history, resolves the request, resumes the workflow, and audits the transition. A stale version raises SQLSTATE `40001`.
- `write_audit_log(...)` is service-role only. Controlled security-definer RPCs invoke it inside their own transaction; trusted server routes use the service client after session/role validation. Browser roles have no generic audit insert path, and direct update/delete has no policy.
- `save_workflow_checkpoint(...)` atomically persists state and advances the workflow pointer.
- Queue claim/heartbeat/complete/fail and `check_rate_limit(...)` are executable only by `service_role` (or the database owner over the pooler), not by browser roles.

Approval decisions, workflow checkpoints, audit logs, and AI usage logs have read policies where appropriate but no authenticated direct mutation policies.

The evaluation corpus is installation-owned. Authenticated members may read their tenant-local question rows, but cannot insert, update, or delete them. Publishing a new suite creates new versioned rows, serializes active-suite activation, and preserves any question identity referenced by historical evaluation results.

## Private Storage

The `policy-documents` bucket is private, capped at 20 MiB, and accepts PDF, DOCX, TXT, and Markdown MIME types. A document key must be:

```text
<organization-uuid>/<document-uuid>/<sanitized-filename>
```

Object insertion requires an existing document record with the exact bucket/path and an administrator or policy-manager membership. Object reads require access to the matching document or report. Downloads should be issued as short-lived signed URLs by a server route after validating the session; never make the bucket public or return the service key.

Stored report objects use the stricter path `{organization_id}/reports/{comparison_id}/{versioned_file}`. A database constraint binds the path to the report row's exact tenant and comparison, preventing one authorized comparison from pointing at another comparison's artifact.

Treat filenames and document text as untrusted. Sanitize display names in the application, reject traversal and unsupported MIME/extension pairs, verify magic bytes during extraction, and never include raw policy instructions in a system-message position.

## Operational checks

After migrations, run the SQL tests with the Supabase CLI. In production, also verify:

1. A department user cannot retrieve another department's document, chunk, action, or signed URL.
2. An auditor can read evidence and history but every mutation returns an RLS error.
3. A policy manager cannot manage memberships or read AI cost logs.
4. A stale approval tab receives SQLSTATE `40001` and cannot create a second decision.
5. Anonymous requests cannot query application tables or rate-limit counters.
6. The publishable client cannot invoke job-lease or rate-limit RPCs.
