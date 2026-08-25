import { apiRoute } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { ApiError } from "@/lib/security/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ comparisonId: string }> };

function fileName(title: string, extension: string) {
  const base = title
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${base || "policy-impact-report"}.${extension}`;
}

export async function GET(request: Request, context: Context) {
  const { comparisonId } = await context.params;
  return apiRoute(
    { roles: permissions.reviewFindings },
    async ({ session }) => {
      const format = new URL(request.url).searchParams.get("format") ?? "pdf";
      if (format !== "md" && format !== "pdf") {
        throw new ApiError("Report format must be md or pdf.", 400, "INVALID_REPORT_FORMAT");
      }
      const supabase = await createServerSupabaseClient();
      const admin = createAdminSupabaseClient();
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .select("id,title,content,storage_bucket,storage_path,generation_version")
        .eq("organization_id", session.organizationId)
        .eq("comparison_id", comparisonId)
        .eq("format", format === "md" ? "markdown" : "pdf")
        .order("generation_version", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reportError) throw reportError;
      if (!report) {
        throw new ApiError(
          "The requested report artifact is not ready yet.",
          409,
          "REPORT_NOT_READY",
        );
      }
      const title = report.title || "Policy change impact report";

      if (format === "md") {
        if (!report.content) throw new ApiError("The Markdown report is incomplete.", 409, "REPORT_NOT_READY");
        return new Response(report.content, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "content-disposition": `attachment; filename="${fileName(title, "md")}"`,
          },
        });
      }

      if (!report.storage_path || report.storage_bucket !== "policy-documents") {
        throw new ApiError("The PDF report is incomplete.", 409, "REPORT_NOT_READY");
      }
      const { data: storedPdf, error: storageError } = await admin.storage
        .from("policy-documents")
        .download(report.storage_path);
      if (storageError || !storedPdf) {
        throw new ApiError("The PDF report could not be retrieved securely.", 503, "REPORT_STORAGE_FAILED");
      }
      const bytes = Buffer.from(await storedPdf.arrayBuffer());
      return new Response(bytes, {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(bytes.byteLength),
          "content-disposition": `attachment; filename="${fileName(title, "pdf")}"`,
        },
      });
    },
  )(request);
}
