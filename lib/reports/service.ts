import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EvaluationMetrics, EvaluationMode } from "@/lib/evaluation";
import { ApiError } from "@/lib/security/errors";
import { PolicyWorkflowStateSchema } from "@/lib/workflows";

import type { PolicyReportInput, ReportEvaluationSummary } from "./types";

const metricColumns = [
  "retrieval_precision",
  "retrieval_recall",
  "context_relevance",
  "answer_relevance",
  "faithfulness",
  "citation_correctness",
  "change_detection_accuracy",
  "conflict_detection_accuracy",
  "unsupported_claim_rate",
  "latency_ms",
  "input_tokens",
  "output_tokens",
  "estimated_cost_usd",
] as const;

type EvaluationRow = Record<(typeof metricColumns)[number], number | string | null> & {
  variant: EvaluationMode;
};

function numeric(row: EvaluationRow, key: (typeof metricColumns)[number]) {
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function average(rows: EvaluationRow[], key: (typeof metricColumns)[number]) {
  return rows.length
    ? rows.reduce((sum, row) => sum + numeric(row, key), 0) / rows.length
    : 0;
}

function evaluationSummaries(rows: EvaluationRow[]): ReportEvaluationSummary[] {
  const modes = [...new Set(rows.map((row) => row.variant))];
  return modes.map((mode) => {
    const group = rows.filter((row) => row.variant === mode);
    const inputTokens = Math.round(average(group, "input_tokens"));
    const outputTokens = Math.round(average(group, "output_tokens"));
    const metrics: EvaluationMetrics = {
      retrievalPrecision: average(group, "retrieval_precision"),
      retrievalRecall: average(group, "retrieval_recall"),
      contextRelevance: average(group, "context_relevance"),
      answerRelevance: average(group, "answer_relevance"),
      faithfulness: average(group, "faithfulness"),
      citationCorrectness: average(group, "citation_correctness"),
      changeDetectionAccuracy: average(group, "change_detection_accuracy"),
      conflictDetectionAccuracy: average(group, "conflict_detection_accuracy"),
      unsupportedClaimRate: average(group, "unsupported_claim_rate"),
      latencyMs: average(group, "latency_ms"),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: average(group, "estimated_cost_usd"),
    };
    return { mode, metrics, questionCount: group.length };
  });
}

export async function loadPolicyReportInput(
  supabase: SupabaseClient,
  organizationId: string,
  comparisonId: string,
  generatedBy?: string,
): Promise<PolicyReportInput> {
  const { data: comparison, error: comparisonError } = await supabase
    .from("policy_comparisons")
    .select("id")
    .eq("id", comparisonId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (comparisonError) throw comparisonError;
  if (!comparison) throw new ApiError("Comparison not found.", 404, "NOT_FOUND");

  const { data: run, error: runError } = await supabase
    .from("workflow_runs")
    .select("state,status")
    .eq("comparison_id", comparisonId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw runError;
  if (!run) {
    throw new ApiError(
      "This comparison does not have an analysis workflow yet.",
      409,
      "REPORT_NOT_READY",
    );
  }
  const parsedState = PolicyWorkflowStateSchema.safeParse(run.state);
  if (!parsedState.success || !parsedState.data.report) {
    throw new ApiError(
      "The final evidence-backed report is not ready yet.",
      409,
      "REPORT_NOT_READY",
    );
  }

  const { data: comparisonEvaluationRows, error: evaluationError } = await supabase
    .from("evaluation_results")
    .select(`variant,${metricColumns.join(",")}`)
    .eq("organization_id", organizationId)
    .eq("comparison_id", comparisonId);
  if (evaluationError) throw evaluationError;

  let evaluationRows = comparisonEvaluationRows ?? [];
  if (evaluationRows.length === 0) {
    const { data: latest, error: latestError } = await supabase
      .from("evaluation_results")
      .select("run_label")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (latest?.run_label) {
      const { data: latestRows, error: latestRowsError } = await supabase
        .from("evaluation_results")
        .select(`variant,${metricColumns.join(",")}`)
        .eq("organization_id", organizationId)
        .eq("run_label", latest.run_label);
      if (latestRowsError) throw latestRowsError;
      evaluationRows = latestRows ?? [];
    }
  }

  return {
    state: parsedState.data,
    evaluation: evaluationSummaries(evaluationRows as unknown as EvaluationRow[]),
    generatedAt: new Date().toISOString(),
    generatedBy,
  };
}
