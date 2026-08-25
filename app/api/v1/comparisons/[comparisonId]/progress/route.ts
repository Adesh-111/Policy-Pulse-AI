import { apiRoute, json } from "@/lib/api/route";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ comparisonId: string }> };

export async function GET(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: run, error } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("comparison_id", comparisonId)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!run) throw new ApiError("Workflow not found.", 404, "NOT_FOUND");
    const { data: checkpoints } = await supabase
      .from("workflow_checkpoints")
      .select("id,node_name,sequence_number,metadata,created_at")
      .eq("workflow_run_id", run.id)
      .order("sequence_number", { ascending: true });
    const { data: activeJob, error: jobError } = await supabase
      .from("background_jobs")
      .select("id,status,attempts,max_attempts,next_attempt_at")
      .eq("workflow_run_id", run.id)
      .in("status", ["queued", "running", "retry_scheduled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) throw jobError;
    return json({
      data: { run, checkpoints: checkpoints ?? [], active_job: activeJob },
    });
  })(request);
}
