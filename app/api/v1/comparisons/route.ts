import { randomUUID } from "node:crypto";
import { apiRoute, json } from "@/lib/api/route";
import { comparisonCreateSchema } from "@/lib/api/schemas";
import { parsePagination } from "@/lib/api/pagination";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { writeAuditEvent } from "@/lib/audit/log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute({}, async ({ request, session }) => {
  const { page, pageSize, query } = parsePagination(request.url);
  const supabase = await createServerSupabaseClient();
  let builder = supabase
    .from("policy_comparisons")
    .select(
      "*, old_document:documents!policy_comparisons_old_document_tenant_fk(id,title,version), new_document:documents!policy_comparisons_new_document_tenant_fk(id,title,version)",
      { count: "exact" },
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (query) builder = builder.ilike("title", `%${query.replace(/[%_]/g, "")}%`);
  const { data, error, count } = await builder;
  if (error) throw error;
  return json({ data, pagination: { page, pageSize, total: count ?? 0 } });
});

export const POST = apiRoute(
  {
    roles: permissions.comparePolicies,
    body: comparisonCreateSchema,
    rateLimit: { scope: "comparison-create", limit: 10, windowSeconds: 60 },
  },
  async ({ body, session, requestId }) => {
    const supabase = await createServerSupabaseClient();
    const { data: documents, error: documentError } = await supabase
      .from("documents")
      .select(
        "id,title,version,processing_status,organization_id,designation,effective_date,category",
      )
      .eq("organization_id", session.organizationId)
      .in("id", [body.oldDocumentId, body.newDocumentId]);
    if (documentError) throw documentError;
    if (documents?.length !== 2) {
      throw new ApiError(
        "Both policy versions must be accessible.",
        400,
        "DOCUMENT_PAIR_INVALID",
      );
    }
    if (documents.some((document) => document.processing_status !== "indexed")) {
      throw new ApiError(
        "Both policy versions must finish indexing before comparison.",
        409,
        "DOCUMENTS_NOT_INDEXED",
      );
    }
    const oldDocument = documents.find((item) => item.id === body.oldDocumentId)!;
    const newDocument = documents.find((item) => item.id === body.newDocumentId)!;
    if (oldDocument.designation !== "old" || newDocument.designation !== "new") {
      throw new ApiError(
        "Choose a document designated as the older version and one designated as the new version.",
        400,
        "DOCUMENT_DESIGNATIONS_INVALID",
      );
    }
    if (Date.parse(oldDocument.effective_date) > Date.parse(newDocument.effective_date)) {
      throw new ApiError(
        "The older policy effective date cannot be later than the new policy effective date.",
        400,
        "DOCUMENT_CHRONOLOGY_INVALID",
      );
    }
    const comparisonId = randomUUID();
    const comparisonRecord = {
      id: comparisonId,
      organization_id: session.organizationId,
      old_document_id: body.oldDocumentId,
      new_document_id: body.newDocumentId,
      requested_by: session.user.id,
      title:
        body.title ??
        `${oldDocument.title} ${oldDocument.version} → ${newDocument.version}`,
      status: "draft",
      analysis_version: 1,
    };
    const { error } = await supabase
      .from("policy_comparisons")
      .insert(comparisonRecord);
    if (error) throw error;
    const { data, error: readError } = await supabase
      .from("policy_comparisons")
      .select()
      .eq("id", comparisonId)
      .eq("organization_id", session.organizationId)
      .single();
    if (readError) throw readError;
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "comparison.created",
      targetType: "policy_comparison",
      targetId: data.id,
      requestId,
      after: data,
    });
    return json({ data }, { status: 201 });
  },
);
