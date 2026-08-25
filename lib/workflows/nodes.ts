import { interrupt, isGraphInterrupt } from "@langchain/langgraph";

import {
  ActionPlannerOutputSchema,
  ChangeDetectorOutputSchema,
  ConflictDetectorOutputSchema,
  ImpactAnalystOutputSchema,
  policyAgentDefinitions,
  PolicyAnalystOutputSchema,
  type PolicyAgentName,
  QualityReviewerOutputSchema,
  ReportWriterOutputSchema,
  RiskReviewerOutputSchema,
  runPolicyAgent,
  type AgentToolRegistry,
  type Citation,
  type PolicyAgentDefinition,
} from "@/lib/ai";
import type { OpenAIService } from "@/lib/openai";

import {
  ApprovalResumeSchema,
  PolicyWorkflowStateSchema,
  type ApprovalRequest,
  type PolicyGraphState,
  type PolicyGraphUpdate,
  type PolicyWorkflowState,
  type WorkflowDocument,
  type WorkflowNodeName,
} from "./state";
import type { WorkflowRunStore } from "./persistence";
import type { WorkflowMaterializer } from "./materializer";

export interface WorkflowAgentContext {
  organizationId: string;
  userId: string;
  workflowId: string;
  signal?: AbortSignal;
}

export interface WorkflowAgentExecutor {
  run(
    name: PolicyAgentName,
    input: unknown,
    context: WorkflowAgentContext,
  ): Promise<unknown>;
}

export class OpenAIWorkflowAgentExecutor implements WorkflowAgentExecutor {
  constructor(
    private readonly openAI: OpenAIService,
    private readonly tools: AgentToolRegistry = {},
  ) {}

  async run(
    name: PolicyAgentName,
    input: unknown,
    context: WorkflowAgentContext,
  ): Promise<unknown> {
    const definition = policyAgentDefinitions[name] as PolicyAgentDefinition;
    return runPolicyAgent(this.openAI, definition, input, {
      organizationId: context.organizationId,
      userId: context.userId,
      workflowId: context.workflowId,
      signal: context.signal,
      tools: this.tools,
      // Policy extraction already receives the complete authorized evidence
      // set. A planning loop only adds model calls before producing the result.
      maxToolCalls: name === "policy_analyst" ? 0 : 2,
    });
  }
}

export interface WorkflowEvidenceService {
  loadDocumentEvidence(
    document: WorkflowDocument,
    state: PolicyWorkflowState,
  ): Promise<Citation[]>;
  retrieveComparisonEvidence(
    state: PolicyWorkflowState,
    attempt: number,
  ): Promise<{ citations: Citation[]; sufficientEvidence: boolean }>;
  retrieveConflictEvidence(state: PolicyWorkflowState): Promise<Citation[]>;
}

export interface WorkflowNodeServices {
  agents: WorkflowAgentExecutor;
  evidence: WorkflowEvidenceService;
  runStore?: WorkflowRunStore;
  materializer?: WorkflowMaterializer;
  signal?: AbortSignal;
}

type WorkflowNode = (state: PolicyGraphState) => Promise<PolicyGraphUpdate>;

function agentContext(
  state: PolicyWorkflowState,
  signal?: AbortSignal,
): WorkflowAgentContext {
  return {
    organizationId: state.organizationId,
    userId: state.requestedBy,
    workflowId: state.runId,
    signal,
  };
}

function updated(
  state: PolicyWorkflowState,
  patch: Partial<PolicyWorkflowState>,
): PolicyWorkflowState {
  return PolicyWorkflowStateSchema.parse({
    ...state,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export function canonicalizeAuthorizedCitation(
  citation: Citation,
  allowed: ReadonlyMap<string, Citation>,
): Citation {
  const trusted = allowed.get(citation.chunkId);
  if (!trusted) {
    throw new Error(
      `Agent returned an unauthorized or unknown evidence chunk: ${citation.chunkId}`,
    );
  }
  if (trusted.documentId !== citation.documentId) {
    throw new Error(
      `Agent citation ${citation.chunkId} does not match its authorized document`,
    );
  }
  return trusted;
}

function citationMap(citations: Citation[]): Map<string, Citation> {
  return new Map(citations.map((citation) => [citation.chunkId, citation]));
}

function workflowCitationMap(
  state: PolicyWorkflowState,
): Map<string, Citation> {
  const citations = [
    ...state.evidence,
    ...(state.oldPolicy?.rules.map((rule) => rule.citation) ?? []),
    ...(state.newPolicy?.rules.map((rule) => rule.citation) ?? []),
  ];
  return citationMap(citations);
}

function validateDocuments(state: PolicyWorkflowState): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (state.oldDocument.documentId === state.newDocument.documentId) {
    issues.push("Old and new policies must be different documents.");
  }
  if (state.oldDocument.designation !== "old")
    issues.push("The baseline policy must be designated old.");
  if (state.newDocument.designation !== "new")
    issues.push("The comparison policy must be designated new.");
  if (!state.oldDocument.storagePath || !state.newDocument.storagePath) {
    issues.push("Both documents must have protected storage paths.");
  }
  if (Number.isNaN(Date.parse(state.oldDocument.effectiveDate))) {
    issues.push("The old policy effective date is invalid.");
  }
  if (Number.isNaN(Date.parse(state.newDocument.effectiveDate))) {
    issues.push("The new policy effective date is invalid.");
  }
  return { valid: issues.length === 0, issues };
}

function approvalRequest(state: PolicyWorkflowState): ApprovalRequest {
  const qualityFailed =
    !state.qualityReview?.passed ||
    (state.qualityReview?.qualityScore ?? 0) < state.qualityThreshold ||
    (state.qualityReview?.hallucinationCount ?? 0) > 0;
  const overallRisk = state.riskAssessment?.overallRisk ?? null;
  const reason = !state.sufficientEvidence
    ? "insufficient_evidence"
    : qualityFailed
      ? "quality_review"
      : overallRisk === "critical"
        ? "critical_risk"
        : "high_risk";
  return {
    runId: state.runId,
    reason,
    overallRisk,
    findingIds: [
      ...(state.changeDetection?.changes.map((finding) => finding.id) ?? []),
      ...(state.conflictDetection?.conflicts.map((finding) => finding.id) ??
        []),
      ...(state.riskAssessment?.risks.map((finding) => finding.id) ?? []),
    ],
    qualityIssues: state.qualityReview?.issues ?? [],
    revisionCount: state.totalRevisionCount,
    analysisVersion: state.analysisVersion,
  };
}

function wrapNode(
  node: WorkflowNodeName,
  action: (state: PolicyWorkflowState) => Promise<PolicyWorkflowState>,
  store?: WorkflowRunStore,
  materializer?: WorkflowMaterializer,
): WorkflowNode {
  return async (graphState) => {
    const timestamp = new Date().toISOString();
    const started = updated(graphState.workflow, {
      currentNode: node,
      status: node === "human_approval" ? "awaiting_approval" : "running",
      history: [
        ...graphState.workflow.history,
        { node, status: "started", timestamp, detail: null },
      ],
    });
    await store?.persistNodeState(started, node);
    try {
      const result = await action(started);
      const completed = updated(result, {
        history: [
          ...result.history,
          {
            node,
            status: "completed",
            timestamp: new Date().toISOString(),
            detail: null,
          },
        ],
      });
      await materializer?.materialize(completed, node);
      await store?.persistNodeState(completed, node);
      return { workflow: completed };
    } catch (error) {
      if (isGraphInterrupt(error)) {
        const interrupted = updated(started, {
          status: "awaiting_approval",
          history: [
            ...started.history,
            {
              node,
              status: "interrupted",
              timestamp: new Date().toISOString(),
              detail: "Awaiting reviewer decision",
            },
          ],
        });
        await store?.persistNodeState(interrupted, node);
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Unknown workflow node failure";
      await store?.markFailed(started, node, message);
      throw error;
    }
  };
}

export function createWorkflowNodes(services: WorkflowNodeServices) {
  const lifecycle = (
    node: WorkflowNodeName,
    action: (state: PolicyWorkflowState) => Promise<PolicyWorkflowState>,
    store?: WorkflowRunStore,
  ) => wrapNode(node, action, store, services.materializer);

  const documentValidation = lifecycle(
    "document_validation",
    async (state) => {
      const validation = validateDocuments(state);
      return updated(state, {
        validation: { ...validation, checkedAt: new Date().toISOString() },
        status: validation.valid ? "running" : "invalid",
        errors: validation.valid
          ? state.errors
          : [...state.errors, ...validation.issues],
      });
    },
    services.runStore,
  );

  const policyExtraction = lifecycle(
    "policy_extraction",
    async (state) => {
      const [oldEvidence, newEvidence] = await Promise.all([
        services.evidence.loadDocumentEvidence(state.oldDocument, state),
        services.evidence.loadDocumentEvidence(state.newDocument, state),
      ]);
      if (oldEvidence.length === 0 || newEvidence.length === 0) {
        throw new Error(
          "Both policy versions require indexed evidence before extraction",
        );
      }
      const context = agentContext(state, services.signal);
      const [oldRaw, newRaw] = await Promise.all([
        services.agents.run(
          "policy_analyst",
          {
            documentId: state.oldDocument.documentId,
            documentTitle: state.oldDocument.title,
            version: state.oldDocument.version,
            evidence: oldEvidence,
          },
          context,
        ),
        services.agents.run(
          "policy_analyst",
          {
            documentId: state.newDocument.documentId,
            documentTitle: state.newDocument.title,
            version: state.newDocument.version,
            evidence: newEvidence,
          },
          context,
        ),
      ]);
      const oldPolicy = PolicyAnalystOutputSchema.parse(oldRaw);
      const newPolicy = PolicyAnalystOutputSchema.parse(newRaw);
      const oldAllowed = citationMap(oldEvidence);
      const newAllowed = citationMap(newEvidence);
      return updated(state, {
        oldPolicy: {
          ...oldPolicy,
          rules: oldPolicy.rules.map((rule) => ({
            ...rule,
            citation: canonicalizeAuthorizedCitation(rule.citation, oldAllowed),
          })),
        },
        newPolicy: {
          ...newPolicy,
          rules: newPolicy.rules.map((rule) => ({
            ...rule,
            citation: canonicalizeAuthorizedCitation(rule.citation, newAllowed),
          })),
        },
      });
    },
    services.runStore,
  );

  const evidenceRetrieval = lifecycle(
    "evidence_retrieval",
    async (state) => {
      const attempt = state.evidenceAttempts + 1;
      const result = await services.evidence.retrieveComparisonEvidence(
        state,
        attempt,
      );
      const citations = new Map(
        state.evidence.map((citation) => [citation.chunkId, citation]),
      );
      for (const citation of result.citations)
        citations.set(citation.chunkId, citation);
      return updated(state, {
        evidence: [...citations.values()],
        sufficientEvidence: result.sufficientEvidence,
        evidenceAttempts: attempt,
      });
    },
    services.runStore,
  );

  const changeDetection = lifecycle(
    "change_detection",
    async (state) => {
      if (!state.oldPolicy || !state.newPolicy)
        throw new Error("Policy extraction must complete first");
      const raw = await services.agents.run(
        "change_detector",
        {
          oldRules: state.oldPolicy.rules,
          newRules: state.newPolicy.rules,
          evidence: state.evidence,
        },
        agentContext(state, services.signal),
      );
      const parsed = ChangeDetectorOutputSchema.parse(raw);
      const allowed = workflowCitationMap(state);
      return updated(state, {
        changeDetection: {
          ...parsed,
          changes: parsed.changes.map((change) => ({
            ...change,
            oldCitation: change.oldCitation
              ? canonicalizeAuthorizedCitation(change.oldCitation, allowed)
              : null,
            newCitation: change.newCitation
              ? canonicalizeAuthorizedCitation(change.newCitation, allowed)
              : null,
          })),
        },
      });
    },
    services.runStore,
  );

  const conflictDetection = lifecycle(
    "conflict_detection",
    async (state) => {
      if (!state.oldPolicy || !state.newPolicy || !state.changeDetection) {
        throw new Error(
          "Change detection must complete before conflict analysis",
        );
      }
      const adjacentPolicyEvidence =
        await services.evidence.retrieveConflictEvidence(state);
      const evidenceByChunk = citationMap(state.evidence);
      for (const citation of adjacentPolicyEvidence) {
        evidenceByChunk.set(citation.chunkId, citation);
      }
      const crossPolicyEvidence = [...evidenceByChunk.values()];
      const raw = await services.agents.run(
        "conflict_detector",
        {
          rules: [...state.oldPolicy.rules, ...state.newPolicy.rules],
          changes: state.changeDetection.changes,
          crossPolicyEvidence,
        },
        agentContext(state, services.signal),
      );
      const parsed = ConflictDetectorOutputSchema.parse(raw);
      const allowed = workflowCitationMap({
        ...state,
        evidence: crossPolicyEvidence,
      });
      return updated(state, {
        evidence: crossPolicyEvidence,
        conflictDetection: {
          ...parsed,
          conflicts: parsed.conflicts.map((conflict) => ({
            ...conflict,
            citations: conflict.citations.map((citation) =>
              canonicalizeAuthorizedCitation(citation, allowed),
            ),
          })),
        },
      });
    },
    services.runStore,
  );

  const impactAnalysis = lifecycle(
    "impact_analysis",
    async (state) => {
      if (!state.changeDetection || !state.conflictDetection) {
        throw new Error(
          "Change and conflict findings are required for impact analysis",
        );
      }
      const raw = await services.agents.run(
        "impact_analyst",
        {
          changes: state.changeDetection.changes,
          conflicts: state.conflictDetection.conflicts,
          knownDepartments: state.knownDepartments,
        },
        agentContext(state, services.signal),
      );
      const parsed = ImpactAnalystOutputSchema.parse(raw);
      const allowed = workflowCitationMap(state);
      return updated(state, {
        impactAnalysis: {
          ...parsed,
          impacts: parsed.impacts.map((impact) => ({
            ...impact,
            citations: impact.citations.map((citation) =>
              canonicalizeAuthorizedCitation(citation, allowed),
            ),
          })),
        },
      });
    },
    services.runStore,
  );

  const riskAssessment = lifecycle(
    "risk_assessment",
    async (state) => {
      if (
        !state.changeDetection ||
        !state.conflictDetection ||
        !state.impactAnalysis
      ) {
        throw new Error("Impact analysis must complete before risk assessment");
      }
      const raw = await services.agents.run(
        "risk_reviewer",
        {
          changes: state.changeDetection.changes,
          conflicts: state.conflictDetection.conflicts,
          impacts: state.impactAnalysis.impacts,
        },
        agentContext(state, services.signal),
      );
      const parsed = RiskReviewerOutputSchema.parse(raw);
      const allowed = workflowCitationMap(state);
      return updated(state, {
        riskAssessment: {
          ...parsed,
          risks: parsed.risks.map((risk) => ({
            ...risk,
            citations: risk.citations.map((citation) =>
              canonicalizeAuthorizedCitation(citation, allowed),
            ),
          })),
        },
      });
    },
    services.runStore,
  );

  const actionPlan = lifecycle(
    "action_plan",
    async (state) => {
      if (
        !state.changeDetection ||
        !state.conflictDetection ||
        !state.impactAnalysis ||
        !state.riskAssessment
      ) {
        throw new Error("Risk assessment must complete before action planning");
      }
      const raw = await services.agents.run(
        "action_planner",
        {
          changes: state.changeDetection.changes,
          conflicts: state.conflictDetection.conflicts,
          impacts: state.impactAnalysis.impacts,
          risks: state.riskAssessment.risks,
          knownDepartments: state.knownDepartments,
        },
        agentContext(state, services.signal),
      );
      const parsed = ActionPlannerOutputSchema.parse(raw);
      const allowed = workflowCitationMap(state);
      return updated(state, {
        actionPlan: {
          ...parsed,
          actions: parsed.actions.map((action) => ({
            ...action,
            citations: action.citations.map((citation) =>
              canonicalizeAuthorizedCitation(citation, allowed),
            ),
          })),
        },
      });
    },
    services.runStore,
  );

  const qualityReview = lifecycle(
    "quality_review",
    async (state) => {
      const raw = await services.agents.run(
        "quality_reviewer",
        {
          changes: state.changeDetection?.changes ?? [],
          conflicts: state.conflictDetection?.conflicts ?? [],
          impacts: state.impactAnalysis?.impacts ?? [],
          risks: state.riskAssessment?.risks ?? [],
          actions: state.actionPlan?.actions ?? [],
          evidence: state.evidence,
          priorIssues: state.revisionInstructions,
        },
        agentContext(state, services.signal),
      );
      const quality = QualityReviewerOutputSchema.parse(raw);
      const passed =
        quality.passed &&
        quality.qualityScore >= state.qualityThreshold &&
        quality.hallucinationCount === 0;
      return updated(state, {
        qualityReview: { ...quality, passed },
        revisionInstructions: passed ? [] : quality.revisionInstructions,
      });
    },
    services.runStore,
  );

  const humanApproval = lifecycle(
    "human_approval",
    async (state) => {
      const request = approvalRequest(state);
      const awaitingState = updated(state, {
        approvalRequest: request,
        status: "awaiting_approval",
      });
      await services.materializer?.materialize(awaitingState, "human_approval");
      const resumed = interrupt<ApprovalRequest, unknown>(request);
      const decision = ApprovalResumeSchema.parse(resumed);
      const recorded = {
        ...decision,
        decidedAt: new Date().toISOString(),
        analysisVersion: state.analysisVersion,
      };
      return updated(awaitingState, {
        approvalRequest: request,
        approvalDecision: recorded,
        approvalHistory: [...state.approvalHistory, recorded],
        status: decision.decision === "approved" ? "running" : "running",
      });
    },
    services.runStore,
  );

  const revision = lifecycle(
    "revision",
    async (state) => {
      const humanTriggered =
        state.approvalDecision?.decision === "revision_requested" ||
        state.approvalDecision?.decision === "rejected";
      const humanNote = humanTriggered
        ? state.approvalDecision?.notes.trim()
        : "";
      const instructions = [
        ...state.revisionInstructions,
        ...(humanNote ? [humanNote] : []),
      ];
      return updated(state, {
        evidence: [],
        sufficientEvidence: false,
        evidenceAttempts: 0,
        changeDetection: null,
        conflictDetection: null,
        impactAnalysis: null,
        riskAssessment: null,
        actionPlan: null,
        qualityReview: null,
        report: null,
        approvalRequest: null,
        approvalDecision: null,
        automaticRevisionCount:
          state.automaticRevisionCount + (humanTriggered ? 0 : 1),
        totalRevisionCount: state.totalRevisionCount + 1,
        analysisVersion: state.analysisVersion + 1,
        revisionInstructions: instructions,
      });
    },
    services.runStore,
  );

  const finalReport = lifecycle(
    "final_report",
    async (state) => {
      if (!state.qualityReview)
        throw new Error("A quality review is required before final reporting");
      const raw = await services.agents.run(
        "report_writer",
        {
          comparisonTitle: `${state.oldDocument.title} -> ${state.newDocument.title}`,
          documentTitles: [state.oldDocument.title, state.newDocument.title],
          changes: state.changeDetection?.changes ?? [],
          conflicts: state.conflictDetection?.conflicts ?? [],
          impacts: state.impactAnalysis?.impacts ?? [],
          risks: state.riskAssessment?.risks ?? [],
          actions: state.actionPlan?.actions ?? [],
          quality: state.qualityReview,
          approvalSummary: state.approvalDecision
            ? `${state.approvalDecision.decision}: ${state.approvalDecision.notes}`
            : "Human approval was not required.",
        },
        agentContext(state, services.signal),
      );
      return updated(state, {
        report: ReportWriterOutputSchema.parse(raw),
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    },
    services.runStore,
  );

  return {
    document_validation: documentValidation,
    policy_extraction: policyExtraction,
    evidence_retrieval: evidenceRetrieval,
    change_detection: changeDetection,
    conflict_detection: conflictDetection,
    impact_analysis: impactAnalysis,
    risk_assessment: riskAssessment,
    action_plan: actionPlan,
    quality_review: qualityReview,
    human_approval: humanApproval,
    revision,
    final_report: finalReport,
  } satisfies Record<WorkflowNodeName, WorkflowNode>;
}
