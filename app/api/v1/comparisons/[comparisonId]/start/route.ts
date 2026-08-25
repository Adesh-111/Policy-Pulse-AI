import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ comparisonId: string }> };

export async function POST(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute(
    {
      roles: permissions.comparePolicies,
      rateLimit: { scope: "comparison-start", limit: 6, windowSeconds: 60 },
    },
    async ({ requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: startResult, error: startError } = await supabase.rpc(
        "start_policy_comparison_workflow",
        {
          p_comparison_id: comparisonId,
          p_request_id: requestId,
        },
      );
      if (startError?.code === "P0002") {
        throw new ApiError("Comparison not found.", 404, "NOT_FOUND");
      }
      if (startError?.code === "55000") {
        throw new ApiError(
          "This comparison cannot be started in its current state.",
          409,
          "COMPARISON_NOT_STARTABLE",
        );
      }
      if (startError) throw startError;
      if (!startResult || typeof startResult !== "object" || !("run" in startResult)) {
        throw new ApiError("Unable to start comparison.", 500, "WORKFLOW_START_FAILED");
      }
      const run = startResult.run;
      if (!run || typeof run !== "object" || !("id" in run)) {
        throw new ApiError("Unable to start comparison.", 500, "WORKFLOW_START_FAILED");
      }
      return json(
        {
          data: {
            ...run,
            runId: run.id,
            workflowRunId: run.id,
            created: startResult.created,
            job: startResult.job,
          },
        },
        { status: 202 },
      );
    },
  )(request);
}
