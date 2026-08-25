import { apiRoute, json } from "@/lib/api/route";
import { parsePagination } from "@/lib/api/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute(
  { roles: ["administrator", "auditor"] },
  async ({ request, session }) => {
    const { page, pageSize, query } = parsePagination(request.url);
    const supabase = await createServerSupabaseClient();
    let builder = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (query) builder = builder.ilike("action", `%${query}%`);
    const { data, error, count } = await builder;
    if (error) throw error;
    return json({ data, pagination: { page, pageSize, total: count ?? 0 } });
  },
);
