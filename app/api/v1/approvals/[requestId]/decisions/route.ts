import { apiRoute, json } from "@/lib/api/route";
import { approvalDecisionSchema } from "@/lib/api/schemas";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ requestId: string }> };

export async function POST(request: Request, context: Context) {
  const { requestId } = await context.params;
  return apiRoute(
    {
      roles: permissions.decideApproval,
      body: approvalDecisionSchema,
      rateLimit: { scope: "approval-decision", limit: 20, windowSeconds: 60 },
    },
    async ({ body, session }) => {
      const supabase = await createServerSupabaseClient();
      const { data: approval } = await supabase
        .from("approval_requests")
        .select("id,workflow_run_id,comparison_id,analysis_version,status")
        .eq("id", requestId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (!approval) {
        throw new ApiError("Approval request not found.", 404, "NOT_FOUND");
      }
      const { data: decision, error } = await supabase.rpc(
        "record_approval_decision",
        {
          p_request_id: requestId,
          p_decision: body.decision,
          p_notes: body.notes,
          p_expected_analysis_version: body.expectedAnalysisVersion,
        },
      );
      if (error) {
        const stale = error.code === "40001" || /stale|version|pending/i.test(error.message);
        throw new ApiError(
          stale
            ? "This approval changed while you were reviewing it. Refresh and try again."
            : "The approval decision could not be recorded.",
          stale ? 409 : 400,
          stale ? "STALE_APPROVAL" : "APPROVAL_DECISION_FAILED",
        );
      }
      let job = null;
      if (approval.workflow_run_id) {
        job = await enqueueJob({
          organizationId: session.organizationId,
          jobType: "advance_policy_analysis",
          subjectType: "policy_comparison",
          subjectId: approval.comparison_id,
          workflowRunId: approval.workflow_run_id,
          idempotencyKey: `approval:${requestId}:${body.decision}:v${body.expectedAnalysisVersion}`,
        });
      }
      return json({ data: { decision, job } }, { status: 202 });
    },
  )(request);
}
