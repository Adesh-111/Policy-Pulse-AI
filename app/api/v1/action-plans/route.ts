import { apiRoute, json } from "@/lib/api/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute({}, async ({ request, session }) => {
  const url = new URL(request.url);
  const comparisonId = url.searchParams.get("comparisonId");
  const departmentId = url.searchParams.get("departmentId");
  const supabase = await createServerSupabaseClient();
  let builder = supabase
    .from("action_plans")
    .select(
      "*, departments:departments!action_plans_department_tenant_fk(id,name,code), action_items(*)",
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false });
  if (comparisonId) builder = builder.eq("comparison_id", comparisonId);
  if (departmentId) builder = builder.eq("department_id", departmentId);
  const { data, error } = await builder;
  if (error) throw error;
  return json({ data });
});
