import { apiRoute, json } from "@/lib/api/route";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ comparisonId: string }> };

export async function GET(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("policy_comparisons")
      .select(
        "*, old_document:documents!policy_comparisons_old_document_tenant_fk(*), new_document:documents!policy_comparisons_new_document_tenant_fk(*), policy_changes(*), policy_conflicts(*), risk_assessments(*), action_plans(*)",
      )
      .eq("id", comparisonId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError("Comparison not found.", 404, "NOT_FOUND");
    const { data: workflow } = await supabase
      .from("workflow_runs")
      .select("id,status,current_node,state,retry_count,started_at,paused_at,completed_at,last_error,updated_at")
      .eq("comparison_id", comparisonId)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return json({
      data: workflow
        ? {
            ...data,
            workflow,
            workflow_run_id: workflow.id,
            workflow_status: workflow.status,
            current_node: workflow.current_node,
            state: workflow.state,
          }
        : data,
    });
  })(request);
}
