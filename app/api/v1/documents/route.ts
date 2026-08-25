import { apiRoute, json } from "@/lib/api/route";
import { parsePagination } from "@/lib/api/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute({}, async ({ request, session }) => {
  const { page, pageSize, query } = parsePagination(request.url);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const supabase = await createServerSupabaseClient();
  let builder = supabase
    .from("documents")
    .select(
      "*, departments:departments!documents_department_tenant_fk(id,name,code)",
      { count: "exact" },
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (query) {
    const escaped = query.replace(/[%_,()]/g, "");
    builder = builder.or(
      `title.ilike.%${escaped}%,description.ilike.%${escaped}%,category.ilike.%${escaped}%`,
    );
  }
  if (status) builder = builder.eq("processing_status", status);
  if (category) builder = builder.eq("category", category);
  const { data, error, count } = await builder;
  if (error) throw error;
  return json({ data, pagination: { page, pageSize, total: count ?? 0 } });
});
