import { apiRoute, json } from "@/lib/api/route";
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
      .createSignedUrl(document.storage_path, 300, {
        download: document.original_filename,
      });
    if (error || !data) {
      throw new ApiError(
        "A protected download URL could not be created.",
        503,
        "SIGNED_DOWNLOAD_FAILED",
      );
    }
    return json({ data: { url: data.signedUrl, expiresIn: 300 } });
  })(request);
}
