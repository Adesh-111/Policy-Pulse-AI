import { apiRoute, json } from "@/lib/api/route";
import { departmentSchema } from "@/lib/api/schemas";
import { writeAuditEvent } from "@/lib/audit/log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute({}, async ({ session }) => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("organization_id", session.organizationId)
    .order("name");
  if (error) throw error;
  return json({ data });
});

export const POST = apiRoute(
  { roles: ["administrator"], body: departmentSchema },
  async ({ body, session, requestId }) => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("departments")
      .insert({
        organization_id: session.organizationId,
        code: body.code.toUpperCase(),
        name: body.name,
        description: body.description,
      })
      .select()
      .single();
    if (error) throw error;
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "department.created",
      targetType: "department",
      targetId: data.id,
      requestId,
      after: data,
    });
    return json({ data }, { status: 201 });
  },
);
