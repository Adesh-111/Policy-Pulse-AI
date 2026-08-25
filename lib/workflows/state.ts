import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

import {
  ActionPlannerOutputSchema,
  ChangeDetectorOutputSchema,
  CitationSchema,
  ConflictDetectorOutputSchema,
  ImpactAnalystOutputSchema,
  PolicyAnalystOutputSchema,
  QualityReviewerOutputSchema,
  ReportWriterOutputSchema,
  RiskLevelSchema,
  RiskReviewerOutputSchema,
} from "@/lib/ai";

export const WORKFLOW_NODE_NAMES = [
  "document_validation",
  "policy_extraction",
  "evidence_retrieval",
  "change_detection",
  "conflict_detection",
  "impact_analysis",
  "risk_assessment",
  "action_plan",
  "quality_review",
  "human_approval",
  "revision",
  "final_report",
] as const;

export const WorkflowNodeNameSchema = z.enum(WORKFLOW_NODE_NAMES);

export const WorkflowDocumentSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  category: z.string().min(1),
  departmentId: z.string().nullable(),
  effectiveDate: z.iso.date(),
  storagePath: z.string().min(1),
  designation: z.enum(["old", "new"]),
});

export const DocumentValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
  checkedAt: z.iso.datetime(),
});

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "revision_requested"]),
  reviewerId: z.string().min(1),
  notes: z.string().max(5_000),
  decidedAt: z.iso.datetime(),
  analysisVersion: z.number().int().positive(),
});

export const ApprovalResumeSchema = z.object({
  decision: z.enum(["approved", "rejected", "revision_requested"]),
  reviewerId: z.string().min(1),
  notes: z.string().max(5_000),
});

export const ApprovalRequestSchema = z.object({
  runId: z.string().min(1),
  reason: z.enum(["high_risk", "critical_risk", "quality_review", "insufficient_evidence"]),
  overallRisk: RiskLevelSchema.nullable(),
  findingIds: z.array(z.string()),
  qualityIssues: z.array(z.string()),
  revisionCount: z.number().int().min(0),
  analysisVersion: z.number().int().positive(),
});

export const WorkflowHistoryEntrySchema = z.object({
  node: WorkflowNodeNameSchema,
  status: z.enum(["started", "completed", "interrupted", "failed"]),
  timestamp: z.iso.datetime(),
  detail: z.string().nullable(),
});

export const PolicyWorkflowStateSchema = z.object({
  runId: z.string().min(1),
  threadId: z.string().min(1),
  organizationId: z.string().min(1),
  comparisonId: z.string().nullable(),
  requestedBy: z.string().min(1),
  oldDocument: WorkflowDocumentSchema,
  newDocument: WorkflowDocumentSchema,
  knownDepartments: z.array(z.string()),
  validation: DocumentValidationResultSchema.nullable(),
  oldPolicy: PolicyAnalystOutputSchema.nullable(),
  newPolicy: PolicyAnalystOutputSchema.nullable(),
  evidence: z.array(CitationSchema),
  sufficientEvidence: z.boolean(),
  evidenceAttempts: z.number().int().min(0),
  maxEvidenceAttempts: z.number().int().min(1).max(5),
  changeDetection: ChangeDetectorOutputSchema.nullable(),
  conflictDetection: ConflictDetectorOutputSchema.nullable(),
  impactAnalysis: ImpactAnalystOutputSchema.nullable(),
  riskAssessment: RiskReviewerOutputSchema.nullable(),
  actionPlan: ActionPlannerOutputSchema.nullable(),
  qualityReview: QualityReviewerOutputSchema.nullable(),
  approvalRequest: ApprovalRequestSchema.nullable(),
  approvalDecision: ApprovalDecisionSchema.nullable(),
  approvalHistory: z.array(ApprovalDecisionSchema),
  report: ReportWriterOutputSchema.nullable(),
  automaticRevisionCount: z.number().int().min(0),
  totalRevisionCount: z.number().int().min(0),
  maxAutomaticRevisions: z.number().int().min(0).max(5),
  qualityThreshold: z.number().min(0.5).max(1).default(0.8),
  analysisVersion: z.number().int().positive(),
  revisionInstructions: z.array(z.string()),
  currentNode: WorkflowNodeNameSchema.nullable(),
  status: z.enum([
    "pending",
    "running",
    "awaiting_approval",
    "completed",
    "invalid",
    "failed",
  ]),
  errors: z.array(z.string()),
  history: z.array(WorkflowHistoryEntrySchema),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export interface CreateWorkflowStateInput {
  runId: string;
  threadId: string;
  organizationId: string;
  comparisonId?: string | null;
  requestedBy: string;
  oldDocument: z.input<typeof WorkflowDocumentSchema>;
  newDocument: z.input<typeof WorkflowDocumentSchema>;
  knownDepartments?: string[];
  maxEvidenceAttempts?: number;
  maxAutomaticRevisions?: number;
  qualityThreshold?: number;
  startedAt?: string;
}

export function createInitialWorkflowState(input: CreateWorkflowStateInput): PolicyWorkflowState {
  const startedAt = input.startedAt ?? new Date().toISOString();
  return PolicyWorkflowStateSchema.parse({
    ...input,
    comparisonId: input.comparisonId ?? null,
    knownDepartments: input.knownDepartments ?? [],
    validation: null,
    oldPolicy: null,
    newPolicy: null,
    evidence: [],
    sufficientEvidence: false,
    evidenceAttempts: 0,
    maxEvidenceAttempts: input.maxEvidenceAttempts ?? 2,
    changeDetection: null,
    conflictDetection: null,
    impactAnalysis: null,
    riskAssessment: null,
    actionPlan: null,
    qualityReview: null,
    approvalRequest: null,
    approvalDecision: null,
    approvalHistory: [],
    report: null,
    automaticRevisionCount: 0,
    totalRevisionCount: 0,
    maxAutomaticRevisions: input.maxAutomaticRevisions ?? 2,
    qualityThreshold: input.qualityThreshold ?? 0.8,
    analysisVersion: 1,
    revisionInstructions: [],
    currentNode: null,
    status: "pending",
    errors: [],
    history: [],
    startedAt,
    updatedAt: startedAt,
    completedAt: null,
  });
}

export type WorkflowNodeName = z.infer<typeof WorkflowNodeNameSchema>;
export type WorkflowDocument = z.infer<typeof WorkflowDocumentSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type PolicyWorkflowState = z.infer<typeof PolicyWorkflowStateSchema>;

export const PolicyWorkflowAnnotation = Annotation.Root({
  workflow: Annotation<PolicyWorkflowState>(),
});

export type PolicyGraphState = typeof PolicyWorkflowAnnotation.State;
export type PolicyGraphUpdate = typeof PolicyWorkflowAnnotation.Update;
