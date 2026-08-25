import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("security and workflow integrity migration", () => {
  const migration = source(
    "supabase/migrations/202608250007_security_integrity.sql",
  );
  const releaseMigration = source(
    "supabase/migrations/202608250011_release_integrity.sql",
  );

  it("requires department users to access both comparison documents", () => {
    expect(migration).toMatch(
      /can_access_document\(old_doc\.id\)\s+and public\.can_access_document\(new_doc\.id\)/i,
    );
    expect(migration).toContain(
      "drop policy if exists reports_authorized_select",
    );
    expect(migration).toContain(
      "drop policy if exists policy_documents_authorized_read",
    );
  });

  it("keeps generic audit append service-only while exposing controlled RPCs", () => {
    expect(migration).toMatch(
      /write_audit_log[\s\S]+from public, anon, authenticated;[\s\S]+to service_role;/i,
    );
    expect(migration).toContain("accept_current_user_invitation");
    expect(migration).toContain("start_policy_comparison_workflow");
    expect(migration).toContain("queue_workflow_retry");
  });

  it("enforces one active run and stable database retry generations", () => {
    expect(migration).toContain("workflow_runs_one_active_per_comparison");
    expect(migration).toContain("manual_retry_count = manual_retry_count + 1");
    expect(migration).toContain("format('manual:%s:g%s'");
    const retryRoute = source("app/api/v1/workflows/[runId]/route.ts");
    expect(retryRoute).toContain('"queue_workflow_retry"');
    expect(retryRoute).not.toContain("Date.now()");
  });

  it("activates invited memberships and provisions a tenant-local 24-question suite", () => {
    expect(source("app/auth/callback/route.ts")).toContain(
      '"accept_current_user_invitation"',
    );
    expect(source("app/api/v1/users/route.ts")).toContain(
      'searchParams.set("invite_org"',
    );
    expect(migration.match(/\(1, 'eval-\d{3}'/g)).toHaveLength(24);
    expect(migration).toContain("organizations_provision_evaluation_suite");
  });

  it("links LangGraph checkpoints atomically without replacing domain state", () => {
    const checkpointMigration = source(
      "supabase/migrations/202608250010_atomic_checkpoint_link.sql",
    );
    const persistence = source("lib/workflows/persistence.ts");
    expect(persistence).toContain('.rpc("save_workflow_checkpoint"');
    expect(checkpointMigration).toContain(
      "set current_checkpoint_id = v_checkpoint.id",
    );
    expect(checkpointMigration).not.toMatch(
      /set[\s\S]{0,120}state\s*=\s*p_state/i,
    );
  });

  it("divides ingestion into leased, resumable embedding batches", () => {
    const worker = source("lib/jobs/worker.ts");
    const pooler = source("lib/jobs/pooler.ts");
    expect(worker).toContain('case "embed_document_batch"');
    expect(worker).toContain("EMBEDDING_BATCH_SIZE = 32");
    expect(worker).toContain("heartbeatBackgroundJob");
    expect(worker).toContain("ingestion_generation");
    expect(worker).toContain("replaceStagedDocumentChunks");
    expect(pooler).toContain("getDatabase()");
    expect(pooler).toContain("public.claim_background_jobs");
    expect(pooler).toContain("public.complete_background_job");
  });

  it("binds report objects to one comparison and blocks terminal restarts", () => {
    expect(releaseMigration).toContain(
      "organization_id::text || '/reports/' || comparison_id::text || '/%'",
    );
    expect(releaseMigration).toContain(
      "workflow_runs_prevent_terminal_restart",
    );
    expect(releaseMigration).toContain(
      "v_status in ('approved', 'rejected', 'completed', 'cancelled')",
    );
  });

  it("preserves evaluated question identity and serializes suite activation", () => {
    expect(releaseMigration).toContain("on delete restrict");
    expect(releaseMigration).toContain("evaluation_questions_protect_history");
    expect(releaseMigration).toContain("pg_advisory_xact_lock");
    expect(releaseMigration).toContain(
      "drop policy if exists evaluation_questions_manager_update",
    );
  });
});
