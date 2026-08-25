import { apiRoute } from "@/lib/api/route";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(request: Request, context: Context) {
  const { documentId } = await context.params;
  return apiRoute({}, async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: document } = await supabase
      .from("documents")
      .select("storage_path,original_filename")
      .eq("id", documentId)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (!document) throw new ApiError("Document not found.", 404, "NOT_FOUND");
    const { data, error } = await supabase.storage
      .from("policy-documents")
      .createSignedUrl(document.storage_path, 120, { download: document.original_filename });
    if (error || !data) {
      throw new ApiError("The protected download could not be prepared.", 503, "DOWNLOAD_FAILED");
    }
    return Response.redirect(data.signedUrl, 307);
  })(request);
}
