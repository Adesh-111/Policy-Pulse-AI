import type { ZodType } from "zod";

import {
  ActionPlannerInputSchema,
  ActionPlannerOutputSchema,
  ChangeDetectorInputSchema,
  ChangeDetectorOutputSchema,
  ConflictDetectorInputSchema,
  ConflictDetectorOutputSchema,
  ImpactAnalystInputSchema,
  ImpactAnalystOutputSchema,
  PolicyAnalystInputSchema,
  PolicyAnalystOutputSchema,
  QualityReviewerInputSchema,
  QualityReviewerOutputSchema,
  ReportWriterInputSchema,
  ReportWriterOutputSchema,
  RetrievalSpecialistInputSchema,
  RetrievalSpecialistOutputSchema,
  RiskReviewerInputSchema,
  RiskReviewerOutputSchema,
} from "./schemas";
import { AGENT_ROLE_INSTRUCTIONS, buildSystemInstruction } from "./prompts";
import type { AgentToolDescriptor } from "./tools";

export type PolicyAgentName =
  | "policy_analyst"
  | "retrieval_specialist"
  | "change_detector"
  | "conflict_detector"
  | "impact_analyst"
  | "risk_reviewer"
  | "action_planner"
  | "quality_reviewer"
  | "report_writer";

export interface PolicyAgentDefinition<TInput extends ZodType = ZodType, TOutput extends ZodType = ZodType> {
  name: PolicyAgentName;
  role: string;
  goal: string;
  systemInstruction: string;
  tools: readonly AgentToolDescriptor[];
  inputSchema: TInput;
  outputSchema: TOutput;
  errorHandling: {
    insufficientEvidence: "return_explicit_insufficient_evidence";
    malformedOutput: "validate_and_retry";
    toolFailure: "retry_then_fail_closed";
  };
  retryLimit: number;
}

const errorHandling = {
  insufficientEvidence: "return_explicit_insufficient_evidence",
  malformedOutput: "validate_and_retry",
  toolFailure: "retry_then_fail_closed",
} as const;

const tools = {
  evidenceSearch: {
    name: "hybrid_policy_search",
    purpose: "Retrieve access-filtered policy excerpts using vector and full-text search.",
    readOnly: true,
  },
  citationLookup: {
    name: "citation_lookup",
    purpose: "Resolve an evidence chunk to authoritative document metadata and source text.",
    readOnly: true,
  },
  rules: {
    name: "policy_rule_lookup",
    purpose: "Read structured rules extracted from an authorized policy version.",
    readOnly: true,
  },
} satisfies Record<string, AgentToolDescriptor>;

export const policyAgentDefinitions = {
  policy_analyst: {
    name: "policy_analyst",
    role: "Policy Analyst",
    goal: "Extract faithful, atomic rules from one policy version with precise citations.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.policyAnalyst),
    tools: [tools.citationLookup],
    inputSchema: PolicyAnalystInputSchema,
    outputSchema: PolicyAnalystOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  retrieval_specialist: {
    name: "retrieval_specialist",
    role: "Retrieval Specialist",
    goal: "Find the smallest complete evidence set while preserving authorization filters.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.retrievalSpecialist),
    tools: [tools.evidenceSearch, tools.citationLookup],
    inputSchema: RetrievalSpecialistInputSchema,
    outputSchema: RetrievalSpecialistOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  change_detector: {
    name: "change_detector",
    role: "Change Detector",
    goal: "Classify every material semantic difference between old and new policy rules.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.changeDetector),
    tools: [tools.rules, tools.citationLookup],
    inputSchema: ChangeDetectorInputSchema,
    outputSchema: ChangeDetectorOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  conflict_detector: {
    name: "conflict_detector",
    role: "Conflict Detector",
    goal: "Find evidence-backed contradictions and implementation collisions across policies.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.conflictDetector),
    tools: [tools.evidenceSearch, tools.rules, tools.citationLookup],
    inputSchema: ConflictDetectorInputSchema,
    outputSchema: ConflictDetectorOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  impact_analyst: {
    name: "impact_analyst",
    role: "Impact Analyst",
    goal: "Identify concrete department, operational, people, and system impacts.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.impactAnalyst),
    tools: [tools.rules, tools.citationLookup],
    inputSchema: ImpactAnalystInputSchema,
    outputSchema: ImpactAnalystOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  risk_reviewer: {
    name: "risk_reviewer",
    role: "Risk Reviewer",
    goal: "Assign proportionate, explainable compliance risks and approval requirements.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.riskReviewer),
    tools: [tools.citationLookup],
    inputSchema: RiskReviewerInputSchema,
    outputSchema: RiskReviewerOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  action_planner: {
    name: "action_planner",
    role: "Action Planner",
    goal: "Turn supported risks into specific department-owned implementation steps.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.actionPlanner),
    tools: [tools.rules, tools.citationLookup],
    inputSchema: ActionPlannerInputSchema,
    outputSchema: ActionPlannerOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  quality_reviewer: {
    name: "quality_reviewer",
    role: "Quality Reviewer",
    goal: "Independently reject unsupported, incomplete, or poorly cited analysis.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.qualityReviewer),
    tools: [tools.citationLookup, tools.rules],
    inputSchema: QualityReviewerInputSchema,
    outputSchema: QualityReviewerOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
  report_writer: {
    name: "report_writer",
    role: "Report Writer",
    goal: "Produce an audit-ready synthesis without adding unsupported facts.",
    systemInstruction: buildSystemInstruction(AGENT_ROLE_INSTRUCTIONS.reportWriter),
    tools: [tools.citationLookup],
    inputSchema: ReportWriterInputSchema,
    outputSchema: ReportWriterOutputSchema,
    errorHandling,
    retryLimit: 2,
  },
} as const satisfies Record<PolicyAgentName, PolicyAgentDefinition>;

export function getPolicyAgentDefinition<TName extends PolicyAgentName>(name: TName) {
  return policyAgentDefinitions[name];
}
