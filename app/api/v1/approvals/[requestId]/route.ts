import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ requestId: string }> };

export async function GET(request: Request, context: Context) {
  const { requestId } = await context.params;
  return apiRoute(
    { roles: permissions.reviewFindings },
    async ({ session }) => {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("approval_requests")
        .select(
          "*, approval_decisions(*), policy_comparisons:policy_comparisons!approval_requests_comparison_tenant_fk(*, old_document:documents!policy_comparisons_old_document_tenant_fk(id,title,version), new_document:documents!policy_comparisons_new_document_tenant_fk(id,title,version), policy_changes(*), policy_conflicts(*), risk_assessments(*), action_plans(*,action_items(*)))",
        )
        .eq("id", requestId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError("Approval request not found.", 404, "NOT_FOUND");
      return json({ data });
    },
  )(request);
}
