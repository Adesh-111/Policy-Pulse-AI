import { apiRoute, json } from "@/lib/api/route";
import { actionProgressSchema } from "@/lib/api/schemas";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { writeAuditEvent } from "@/lib/audit/log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ planId: string; itemId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { planId, itemId } = await context.params;
  return apiRoute(
    { roles: permissions.updateActions, body: actionProgressSchema },
    async ({ body, session, requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: before } = await supabase
        .from("action_items")
        .select("*, action_plans!inner(id,department_id,organization_id)")
        .eq("id", itemId)
        .eq("action_plan_id", planId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (!before) throw new ApiError("Action item not found.", 404, "NOT_FOUND");
      const completed = body.status === "completed";
      const { data, error } = await supabase
        .from("action_items")
        .update({
          status: body.status,
          progress_percent: completed ? 100 : body.progressPercent,
          completion_notes: body.note || null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", itemId)
        .eq("action_plan_id", planId)
        .eq("organization_id", session.organizationId)
        .select()
        .single();
      if (error) throw error;
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: "action_item.progress_updated",
        targetType: "action_item",
        targetId: itemId,
        requestId,
        before,
        after: data,
      });
      return json({ data });
    },
  )(request);
}
