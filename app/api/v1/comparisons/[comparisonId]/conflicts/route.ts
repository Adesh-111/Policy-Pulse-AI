import { apiRoute, json } from "@/lib/api/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ comparisonId: string }> };

export async function GET(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("policy_conflicts")
      .select("*")
      .eq("comparison_id", comparisonId)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return json({ data });
  })(request);
}
