import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

interface EnqueueJobInput {
  organizationId: string;
  jobType: string;
  subjectType: string;
  subjectId: string;
  workflowRunId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueJobInput) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("background_jobs")
    .upsert(
      {
        organization_id: input.organizationId,
        job_type: input.jobType,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        workflow_run_id: input.workflowRunId ?? null,
        payload: input.payload ?? {},
        idempotency_key: input.idempotencyKey,
        max_attempts: input.maxAttempts ?? 5,
        status: "queued",
        next_attempt_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id, status")
    .maybeSingle();
  if (error) throw new Error(`Unable to queue job: ${error.code}`);
  return data;
}
