import { z } from "zod";
import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { writeAuditEvent } from "@/lib/audit/log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ documentId: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2_000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  effectiveDate: z.iso.date().optional(),
  departmentId: z.uuid().nullable().optional(),
});

export async function GET(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .select(
        "*, departments:departments!documents_department_tenant_fk(id,name,code), document_departments(department_id, departments(id,name,code))",
      )
      .eq("id", documentId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError("Document not found.", 404, "NOT_FOUND");
    return json({ data });
  })(request);
}

export async function PATCH(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute(
    { roles: permissions.uploadPolicy, body: patchSchema },
    async ({ body, session, requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: before } = await supabase
        .from("documents")
        .select("title,description,category,effective_date,department_id")
        .eq("id", documentId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (!before) throw new ApiError("Document not found.", 404, "NOT_FOUND");
      const changes = {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.effectiveDate !== undefined
          ? { effective_date: body.effectiveDate }
          : {}),
        ...(body.departmentId !== undefined
          ? { department_id: body.departmentId }
          : {}),
      };
      const { data, error } = await supabase
        .from("documents")
        .update(changes)
        .eq("id", documentId)
        .eq("organization_id", session.organizationId)
        .select()
        .single();
      if (error) throw error;
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: "document.updated",
        targetType: "document",
        targetId: documentId,
        requestId,
        before,
        after: data,
      });
      return json({ data });
    },
  )(request);
}

export async function DELETE(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute(
    { roles: permissions.uploadPolicy },
    async ({ session, requestId }) => {
      const supabase = await createServerSupabaseClient();
      const { data: document } = await supabase
        .from("documents")
        .select("metadata,title")
        .eq("id", documentId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (!document) throw new ApiError("Document not found.", 404, "NOT_FOUND");
      const { error } = await supabase
        .from("documents")
        .update({
          metadata: {
            ...(document.metadata && typeof document.metadata === "object"
              ? document.metadata
              : {}),
            archived_at: new Date().toISOString(),
            archived_by: session.user.id,
          },
        })
        .eq("id", documentId)
        .eq("organization_id", session.organizationId);
      if (error) throw error;
      await writeAuditEvent({
        organizationId: session.organizationId,
        actorId: session.user.id,
        action: "document.archived",
        targetType: "document",
        targetId: documentId,
        requestId,
        before: document,
      });
      return new Response(null, { status: 204 });
    },
  )(request);
}
