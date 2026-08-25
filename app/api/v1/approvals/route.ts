import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute(
  { roles: permissions.reviewFindings },
  async ({ request, session }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "pending";
    const supabase = await createServerSupabaseClient();
    let builder = supabase
      .from("approval_requests")
      .select(
        "*, policy_comparisons:policy_comparisons!approval_requests_comparison_tenant_fk(id,title,status,analysis_version,overall_risk,quality_score)",
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });
    if (status !== "all") builder = builder.eq("status", status);
    const { data, error } = await builder;
    if (error) throw error;
    return json({ data });
  },
);
