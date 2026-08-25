import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute(
    {
      roles: permissions.uploadPolicy,
      rateLimit: { scope: "document-upload-complete", limit: 20, windowSeconds: 60 },
    },
    async ({ session }) => {
      const supabase = await createServerSupabaseClient();
      const { data: document, error } = await supabase
        .from("documents")
        .select("id,storage_path,original_filename,processing_status")
        .eq("id", documentId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!document) throw new ApiError("Document not found.", 404, "NOT_FOUND");

      const pathParts = document.storage_path.split("/");
      const objectName = pathParts.pop();
      const folder = pathParts.join("/");
      const { data: objects, error: listError } = await supabase.storage
        .from("policy-documents")
        .list(folder, { search: objectName, limit: 2 });
      if (listError || !objects?.some((item) => item.name === objectName)) {
        throw new ApiError(
          "The protected upload has not completed.",
          409,
          "UPLOAD_NOT_FOUND",
        );
      }

      const { error: updateError } = await supabase
        .from("documents")
        .update({ processing_status: "extracting", processing_error: null })
        .eq("id", documentId)
        .eq("organization_id", session.organizationId);
      if (updateError) throw updateError;

      const job = await enqueueJob({
        organizationId: session.organizationId,
        jobType: "ingest_document",
        subjectType: "document",
        subjectId: documentId,
        idempotencyKey: `ingest:${documentId}`,
      });
      return json({ data: { documentId, status: "extracting", job } }, { status: 202 });
    },
  )(request);
}
