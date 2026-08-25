import { randomUUID } from "node:crypto";
import { apiRoute, json } from "@/lib/api/route";
import { evaluationRunSchema } from "@/lib/api/schemas";
import { parsePagination } from "@/lib/api/pagination";
import { enqueueJob } from "@/lib/jobs/queue";
import {
  EVALUATION_DATASET_VERSION,
  EVALUATION_METRIC_VERSION,
  EVALUATION_PROMPT_VERSION,
} from "@/lib/evaluation";
import { writeAuditEvent } from "@/lib/audit/log";
import { ApiError } from "@/lib/security/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const variantMap = {
  no_rag: "openai_without_rag",
  rag: "openai_with_rag",
  agentic_self_reflection: "rag_agents_reflection",
} as const;

export const GET = apiRoute(
  { roles: ["administrator", "policy_manager", "auditor"] },
  async ({ request, session }) => {
    const { page, pageSize } = parsePagination(request.url);
    const runLabel = new URL(request.url).searchParams.get("runLabel");
    const supabase = await createServerSupabaseClient();
    let builder = supabase
      .from("evaluation_results")
      .select("*, evaluation_questions(external_id,question,category,difficulty)", {
        count: "exact",
      })
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (runLabel) builder = builder.eq("run_label", runLabel);
    const { data, error, count } = await builder;
    if (error) throw error;
    return json({ data, pagination: { page, pageSize, total: count ?? 0 } });
  },
);

export const POST = apiRoute(
  {
    roles: ["administrator", "policy_manager"],
    body: evaluationRunSchema,
    rateLimit: { scope: "evaluation-run", limit: 3, windowSeconds: 300 },
  },
  async ({ body, session, requestId }) => {
    const supabase = await createServerSupabaseClient();
    if (body.comparisonId) {
      const { data: comparison, error } = await supabase
        .from("policy_comparisons")
        .select("id")
        .eq("id", body.comparisonId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!comparison) throw new ApiError("Comparison not found.", 404, "NOT_FOUND");
    }
    const runId = randomUUID();
    const runLabel = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const job = await enqueueJob({
      organizationId: session.organizationId,
      jobType: "run_evaluation",
      subjectType: "evaluation_run",
      subjectId: runId,
      idempotencyKey: `evaluation:${runId}`,
      payload: {
        run_id: runId,
        run_label: runLabel,
        variants: body.modes.map((mode) => variantMap[mode]),
        question_ids: body.questionIds,
        comparison_id: body.comparisonId,
        dataset_version: EVALUATION_DATASET_VERSION,
        metric_version: EVALUATION_METRIC_VERSION,
        prompt_version: EVALUATION_PROMPT_VERSION,
        requested_by: session.user.id,
      },
      maxAttempts: 3,
    });
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "evaluation.queued",
      targetType: "evaluation_run",
      targetId: runId,
      requestId,
      after: {
        runLabel,
        modes: body.modes,
        questionIds: body.questionIds,
        comparisonId: body.comparisonId ?? null,
        datasetVersion: EVALUATION_DATASET_VERSION,
        metricVersion: EVALUATION_METRIC_VERSION,
        promptVersion: EVALUATION_PROMPT_VERSION,
      },
    });
    return json({ data: { runId, runLabel, job } }, { status: 202 });
  },
);
