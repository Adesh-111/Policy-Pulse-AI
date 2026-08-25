import { departmentSchema } from "@/lib/api/schemas";
import { apiRoute, json } from "@/lib/api/route";
import { ApiError } from "@/lib/security/errors";
import { writeAuditEvent } from "@/lib/audit/log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ departmentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { departmentId } = await context.params;
  return apiRoute(
    { roles: ["administrator"], body: departmentSchema.partial() },
    async ({ body, session, requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: before } = await supabase
        .from("departments")
        .select("*")
        .eq("id", departmentId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (!before) throw new ApiError("Department not found.", 404, "NOT_FOUND");
      const { data, error } = await supabase
        .from("departments")
        .update({
          ...(body.code ? { code: body.code.toUpperCase() } : {}),
          ...(body.name ? { name: body.name } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
        })
        .eq("id", departmentId)
        .eq("organization_id", session.organizationId)
        .select()
        .single();
      if (error) throw error;
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: "department.updated",
        targetType: "department",
        targetId: departmentId,
        requestId,
        before,
        after: data,
      });
      return json({ data });
    },
  )(request);
}

export async function DELETE(request: Request, context: Context) {
  const { departmentId } = await context.params;
  return apiRoute(
    { roles: ["administrator"] },
    async ({ session, requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("departments")
        .update({ is_active: false })
        .eq("id", departmentId)
        .eq("organization_id", session.organizationId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError("Department not found.", 404, "NOT_FOUND");
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: "department.deactivated",
        targetType: "department",
        targetId: departmentId,
        requestId,
        after: data,
      });
      return new Response(null, { status: 204 });
    },
  )(request);
}
