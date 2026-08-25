import type { EvaluationMetrics, EvaluationMode } from "@/lib/evaluation";
import type { PolicyWorkflowState } from "@/lib/workflows";

export interface ReportEvaluationSummary {
  mode: EvaluationMode;
  metrics: EvaluationMetrics;
  questionCount: number;
}

export interface PolicyReportInput {
  state: PolicyWorkflowState;
  evaluation?: ReportEvaluationSummary[];
  generatedAt?: string;
  generatedBy?: string;
}
