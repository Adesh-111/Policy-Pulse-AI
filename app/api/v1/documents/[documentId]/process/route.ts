import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { enqueueJob } from "@/lib/jobs/queue";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute({ roles: permissions.uploadPolicy }, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: document } = await supabase
      .from("documents")
      .select("id,processing_status,metadata,updated_at")
      .eq("id", documentId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (!document) throw new ApiError("Document not found.", 404, "NOT_FOUND");
    if (document.processing_status === "indexed") {
      return json({ data: { documentId, status: "indexed" } });
    }
    if (document.processing_status === "failed") {
      const { data: claimedRetry, error: retryError } = await supabase
        .from("documents")
        .update({ processing_status: "extracting", processing_error: null })
        .eq("id", documentId)
        .eq("organization_id", session.organizationId)
        .eq("processing_status", "failed")
        .select("id")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!claimedRetry) {
        return json(
          { data: { documentId, status: "extracting", alreadyQueued: true } },
          { status: 202 },
        );
      }
    }
    const metadata =
      document.metadata &&
      typeof document.metadata === "object" &&
      !Array.isArray(document.metadata)
        ? (document.metadata as Record<string, unknown>)
        : {};
    const generation = Number(metadata.ingestion_generation ?? 0);
    const idempotencyKey =
      document.processing_status === "failed"
        ? `ingest:${documentId}:retry:${document.updated_at}`
        : document.processing_status === "embedding"
          ? `ingest:${documentId}:resume:g${Number.isSafeInteger(generation) ? generation : 0}`
          : `ingest:${documentId}`;
    const job = await enqueueJob({
      organizationId: session.organizationId,
      jobType: "ingest_document",
      subjectType: "document",
      subjectId: documentId,
      idempotencyKey,
    });
    return json(
      { data: { documentId, status: "extracting", job } },
      { status: 202 },
    );
  })(request);
}
