import { END } from "@langchain/langgraph";

import type { PolicyGraphState, PolicyWorkflowState, WorkflowNodeName } from "./state";

export const QUALITY_THRESHOLD = 0.8;

export type WorkflowRoute = WorkflowNodeName | typeof END;

function workflowFrom(value: PolicyWorkflowState | PolicyGraphState): PolicyWorkflowState {
  return "workflow" in value ? value.workflow : value;
}

export function routeAfterValidation(value: PolicyWorkflowState | PolicyGraphState): WorkflowRoute {
  const state = workflowFrom(value);
  return state.validation?.valid ? "policy_extraction" : END;
}

export function routeAfterEvidenceRetrieval(value: PolicyWorkflowState | PolicyGraphState): WorkflowRoute {
  const state = workflowFrom(value);
  if (state.sufficientEvidence) return "change_detection";
  if (state.evidenceAttempts < state.maxEvidenceAttempts) return "evidence_retrieval";
  return "quality_review";
}

export function needsHumanApproval(state: PolicyWorkflowState): boolean {
  const overallRisk = state.riskAssessment?.overallRisk;
  return (
    overallRisk === "high" ||
    overallRisk === "critical" ||
    state.riskAssessment?.requiresHumanApproval === true
  );
}

export function routeAfterQualityReview(value: PolicyWorkflowState | PolicyGraphState): WorkflowRoute {
  const state = workflowFrom(value);
  const quality = state.qualityReview;
  const passed =
    quality?.passed === true &&
    quality.qualityScore >= state.qualityThreshold &&
    quality.hallucinationCount === 0;
  if (passed) return needsHumanApproval(state) ? "human_approval" : "final_report";
  if (state.automaticRevisionCount < state.maxAutomaticRevisions) return "revision";
  return "human_approval";
}

export function routeAfterHumanApproval(value: PolicyWorkflowState | PolicyGraphState): WorkflowRoute {
  const state = workflowFrom(value);
  return state.approvalDecision?.decision === "approved" ? "final_report" : "revision";
}
