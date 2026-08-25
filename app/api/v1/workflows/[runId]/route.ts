import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  const { runId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: run, error } = await supabase
      .from("workflow_runs")
      .select(
        "id,comparison_id,thread_id,status,current_node,state,retry_count,max_retries,next_retry_at,started_at,paused_at,completed_at,last_error,updated_at",
      )
      .eq("id", runId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!run) throw new ApiError("Workflow run not found.", 404, "NOT_FOUND");
    const { data: checkpoints, error: checkpointError } = await supabase
      .from("workflow_checkpoints")
      .select("checkpoint_id,node_name,sequence_number,created_at")
      .eq("workflow_run_id", runId)
      .eq("organization_id", session.organizationId)
      .order("sequence_number", { ascending: false })
      .limit(20);
    if (checkpointError) throw checkpointError;
    return json({ data: { ...run, checkpoints: checkpoints ?? [] } });
  })(request);
}

export async function POST(request: Request, context: Context) {
  const { runId } = await context.params;
  return apiRoute(
    {
      roles: permissions.comparePolicies,
      rateLimit: { scope: "workflow-retry", limit: 10, windowSeconds: 60 },
    },
    async ({ requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: retryResult, error: retryError } = await supabase.rpc(
        "queue_workflow_retry",
        {
          p_workflow_run_id: runId,
          p_request_id: requestId,
        },
      );
      if (retryError?.code === "P0002") {
        throw new ApiError("Workflow run not found.", 404, "NOT_FOUND");
      }
      if (retryError?.code === "55000") {
        throw new ApiError(
          "This workflow cannot be manually advanced in its current state.",
          409,
          "WORKFLOW_NOT_RETRYABLE",
        );
      }
      if (retryError) throw retryError;
      return json({ data: retryResult }, { status: 202 });
    },
  )(request);
}
