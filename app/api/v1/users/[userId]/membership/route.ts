import { apiRoute, json } from "@/lib/api/route";
import { membershipUpdateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId } = await context.params;
  return apiRoute(
    { roles: ["administrator"], body: membershipUpdateSchema },
    async ({ body, session }) => {
      if (
        userId === session.user.id &&
        (body.role !== "administrator" || body.status !== "active")
      ) {
        throw new ApiError(
          "Administrators cannot remove their own administrative role.",
          409,
          "SELF_ROLE_CHANGE_BLOCKED",
        );
      }
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase.rpc("update_membership_access", {
        p_organization_id: session.organizationId,
        p_user_id: userId,
        p_role: body.role,
        p_status: body.status,
        p_department_ids: body.departmentIds,
      });
      if (error?.code === "P0002") {
        throw new ApiError("Membership not found.", 404, "NOT_FOUND");
      }
      if (error?.code === "23514" || error?.code === "55000") {
        throw new ApiError(error.message, 409, "MEMBERSHIP_UPDATE_REJECTED");
      }
      if (error) throw error;
      return json({ data });
    },
  )(request);
}
