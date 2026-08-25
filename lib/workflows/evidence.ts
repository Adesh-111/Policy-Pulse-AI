import type { Citation } from "@/lib/ai";
import {
  retrievePolicyEvidence,
  type HybridRAGServices,
  type RetrievalFilters,
} from "@/lib/rag";

import type { PolicyWorkflowState, WorkflowDocument } from "./state";
import type { WorkflowEvidenceService } from "./nodes";

export class RAGWorkflowEvidenceService implements WorkflowEvidenceService {
  private resolvedDepartmentIds?: Promise<string[]>;

  constructor(
    private readonly rag: HybridRAGServices,
    private readonly authorizedDepartmentIds: string[] = [],
    private readonly resolveAuthorizedDepartmentIds?: () => Promise<string[]>,
  ) {}

  private departmentIds(): Promise<string[]> {
    if (!this.resolveAuthorizedDepartmentIds) {
      return Promise.resolve(this.authorizedDepartmentIds);
    }
    this.resolvedDepartmentIds ??= this.resolveAuthorizedDepartmentIds();
    return this.resolvedDepartmentIds;
  }

  private async filters(
    state: PolicyWorkflowState,
    documentIds: string[],
    excludedDocumentIds: string[] = [],
  ): Promise<RetrievalFilters> {
    return {
      organizationId: state.organizationId,
      documentIds,
      excludedDocumentIds,
      departmentIds: await this.departmentIds(),
      versions: [],
      category: null,
    };
  }

  async loadDocumentEvidence(document: WorkflowDocument, state: PolicyWorkflowState): Promise<Citation[]> {
    const query = [
      `binding requirements, prohibitions, permissions, deadlines, eligibility, exceptions, responsibilities, and retention rules in ${document.title}`,
      `effective date ${document.effectiveDate} version ${document.version}`,
    ].join("; ");
    const result = await retrievePolicyEvidence(
      query,
      await this.filters(state, [document.documentId]),
      this.rag,
      { limit: 16, candidateLimit: 30, minimumEvidence: 1, rewriteQuery: false, rerank: true },
      { organizationId: state.organizationId, userId: state.requestedBy, workflowId: state.runId },
    );
    return result.citations;
  }

  async retrieveComparisonEvidence(state: PolicyWorkflowState, attempt: number) {
    const revisionFocus = state.revisionInstructions.length
      ? `Review focus: ${state.revisionInstructions.join("; ")}`
      : "Review all rule changes and cross-policy conflicts.";
    const query = [
      `Compare ${state.oldDocument.title} version ${state.oldDocument.version} with ${state.newDocument.title} version ${state.newDocument.version}.`,
      "Find changed thresholds, dates, responsibilities, eligibility, exceptions, compliance requirements, contradictions, ambiguity, and missing implementation details.",
      revisionFocus,
      `Evidence pass ${attempt}.`,
    ].join(" ");
    const result = await retrievePolicyEvidence(
      query,
      await this.filters(state, [state.oldDocument.documentId, state.newDocument.documentId]),
      this.rag,
      {
        limit: Math.min(24, 10 + attempt * 6),
        candidateLimit: Math.min(48, 20 + attempt * 10),
        minimumEvidence: 2,
        minimumEvidenceScore: attempt === 1 ? 0.4 : 0.3,
        rewriteQuery: true,
        rerank: true,
      },
      { organizationId: state.organizationId, userId: state.requestedBy, workflowId: state.runId },
    );
    return { citations: result.citations, sufficientEvidence: result.sufficientEvidence };
  }

  async retrieveConflictEvidence(state: PolicyWorkflowState): Promise<Citation[]> {
    const comparedDocumentIds = [
      state.oldDocument.documentId,
      state.newDocument.documentId,
    ];
    const ruleStatements = [
      ...(state.oldPolicy?.rules ?? []),
      ...(state.newPolicy?.rules ?? []),
    ]
      .slice(0, 12)
      .map((rule) => rule.statement.slice(0, 260));
    const changedRequirements = (state.changeDetection?.changes ?? [])
      .slice(0, 8)
      .map((change) => change.explanation.slice(0, 260));
    const query = [
      `Find authoritative requirements in adjacent policies that could contradict or collide with ${state.newDocument.title} version ${state.newDocument.version}.`,
      `Policy category: ${state.newDocument.category}.`,
      "Focus on incompatible thresholds, deadlines, eligibility, exceptions, responsibilities, scope, and implementation requirements.",
      ...ruleStatements,
      ...changedRequirements,
    ].join(" ");
    const result = await retrievePolicyEvidence(
      query,
      await this.filters(state, [], comparedDocumentIds),
      this.rag,
      {
        limit: 12,
        candidateLimit: 48,
        minimumEvidence: 1,
        minimumEvidenceScore: 0.3,
        rewriteQuery: false,
        rerank: false,
      },
      { organizationId: state.organizationId, userId: state.requestedBy, workflowId: state.runId },
    );
    return result.citations.slice(0, 12);
  }
}
