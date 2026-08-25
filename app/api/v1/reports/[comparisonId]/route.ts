import { generatePolicyReportMarkdown, loadPolicyReportInput } from "@/lib/reports";
import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ comparisonId: string }> };

export async function GET(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute(
    { roles: permissions.reviewFindings },
    async ({ session }) => {
      const supabase = await createServerSupabaseClient();
      const input = await loadPolicyReportInput(
        supabase,
        session.organizationId,
        comparisonId,
        session.user.email ?? session.user.id,
      );
      return json({
        data: {
          comparisonId,
          markdown: generatePolicyReportMarkdown(input),
          generatedAt: input.generatedAt,
          evaluation: input.evaluation,
        },
      });
    },
  )(request);
}
