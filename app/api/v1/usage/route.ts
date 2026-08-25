import { apiRoute, json } from "@/lib/api/route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = apiRoute(
  { roles: ["administrator"] },
  async ({ request, session }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const supabase = await createServerSupabaseClient();
    let builder = supabase
      .from("ai_usage_logs")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(1_000);
    if (from) builder = builder.gte("created_at", from);
    if (to) builder = builder.lte("created_at", to);
    const { data, error } = await builder;
    if (error) throw error;

    const summary = (data ?? []).reduce(
      (result, row) => ({
        calls: result.calls + 1,
        inputTokens: result.inputTokens + Number(row.input_tokens ?? 0),
        outputTokens: result.outputTokens + Number(row.output_tokens ?? 0),
        totalTokens: result.totalTokens + Number(row.total_tokens ?? 0),
        estimatedCost:
          result.estimatedCost + Number(row.estimated_cost_usd ?? 0),
        latencyMs: result.latencyMs + Number(row.latency_ms ?? 0),
        failures: result.failures + (row.status === "failed" ? 1 : 0),
      }),
      {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        latencyMs: 0,
        failures: 0,
      },
    );
    return json({ data, summary });
  },
);
