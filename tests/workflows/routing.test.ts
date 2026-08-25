import { END } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import {
  createInitialWorkflowState,
  canonicalizeAuthorizedCitation,
  routeAfterEvidenceRetrieval,
  routeAfterHumanApproval,
  routeAfterQualityReview,
  routeAfterValidation,
  type PolicyWorkflowState,
} from "@/lib/workflows";

function state(): PolicyWorkflowState {
  return createInitialWorkflowState({
    runId: "run-1",
    threadId: "thread-1",
    organizationId: "org-1",
    requestedBy: "user-1",
    oldDocument: {
      documentId: "old-1",
      title: "Attendance Policy",
      version: "1.0",
      category: "Academic",
      departmentId: null,
      effectiveDate: "2025-07-01",
      storagePath: "org-1/old-1.pdf",
      designation: "old",
    },
    newDocument: {
      documentId: "new-1",
      title: "Attendance Policy",
      version: "2.0",
      category: "Academic",
      departmentId: null,
      effectiveDate: "2026-07-01",
      storagePath: "org-1/new-1.pdf",
      designation: "new",
    },
  });
}

const trace = {
  toolUsed: "citation_lookup",
  evidenceFound: 2,
  decisionSummary: "Evidence was checked.",
  confidence: 0.9,
  finalConclusion: "Review complete.",
};

function quality(passed: boolean, score: number, hallucinationCount = 0) {
  return {
    passed,
    qualityScore: score,
    citationScore: score,
    completenessScore: score,
    evidenceSupportScore: score,
    riskReasonablenessScore: score,
    actionSpecificityScore: score,
    hallucinationCount,
    missedChanges: [],
    falseConflicts: [],
    issues: passed ? [] : ["Unsupported finding"],
    revisionInstructions: passed ? [] : ["Remove unsupported finding"],
    trace,
  };
}

describe("LangGraph workflow routing", () => {
  it("canonicalizes citations from the authorized retrieval map and rejects fabricated chunks", () => {
    const trusted = {
      chunkId: "chunk-1",
      documentId: "document-1",
      documentTitle: "Attendance Policy",
      version: "2.0",
      pageNumber: 3,
      sectionHeading: "Attendance threshold",
      evidenceSnippet: "Students must maintain 80% attendance.",
      relevanceScore: 0.91,
    };
    const allowed = new Map([[trusted.chunkId, trusted]]);
    expect(
      canonicalizeAuthorizedCitation(
        { ...trusted, evidenceSnippet: "fabricated replacement text" },
        allowed,
      ),
    ).toEqual(trusted);
    expect(() =>
      canonicalizeAuthorizedCitation({ ...trusted, chunkId: "unknown" }, allowed),
    ).toThrow(/unauthorized|unknown/i);
    expect(() =>
      canonicalizeAuthorizedCitation({ ...trusted, documentId: "other" }, allowed),
    ).toThrow(/authorized document/i);
  });

  it("stops invalid documents and continues valid documents", () => {
    expect(routeAfterValidation({ ...state(), validation: { valid: false, issues: ["bad"], checkedAt: new Date().toISOString() } })).toBe(END);
    expect(routeAfterValidation({ ...state(), validation: { valid: true, issues: [], checkedAt: new Date().toISOString() } })).toBe("policy_extraction");
  });

  it("retrieves additional evidence before moving on", () => {
    expect(routeAfterEvidenceRetrieval({ ...state(), evidenceAttempts: 1, sufficientEvidence: false })).toBe("evidence_retrieval");
    expect(routeAfterEvidenceRetrieval({ ...state(), evidenceAttempts: 2, sufficientEvidence: false })).toBe("quality_review");
    expect(routeAfterEvidenceRetrieval({ ...state(), evidenceAttempts: 1, sufficientEvidence: true })).toBe("change_detection");
  });

  it("auto-revises below 0.80 no more than twice", () => {
    expect(routeAfterQualityReview({ ...state(), qualityReview: quality(false, 0.79) })).toBe("revision");
    expect(
      routeAfterQualityReview({
        ...state(),
        automaticRevisionCount: 2,
        qualityReview: quality(false, 0.79),
      }),
    ).toBe("human_approval");
    expect(routeAfterQualityReview({ ...state(), qualityReview: quality(true, 0.8) })).toBe("final_report");
    expect(
      routeAfterQualityReview({
        ...state(),
        qualityThreshold: 0.9,
        qualityReview: quality(true, 0.85),
      }),
    ).toBe("revision");
  });

  it("routes high risk to approval and resumes by reviewer decision", () => {
    const highRisk = {
      risks: [],
      overallRisk: "high" as const,
      requiresHumanApproval: true,
      summary: "High risk",
      confidence: 0.9,
      trace,
    };
    expect(routeAfterQualityReview({ ...state(), qualityReview: quality(true, 0.9), riskAssessment: highRisk })).toBe("human_approval");
    expect(
      routeAfterHumanApproval({
        ...state(),
        approvalDecision: {
          decision: "approved",
          reviewerId: "reviewer-1",
          notes: "Approved",
          decidedAt: new Date().toISOString(),
          analysisVersion: 1,
        },
      }),
    ).toBe("final_report");
    expect(
      routeAfterHumanApproval({
        ...state(),
        approvalDecision: {
          decision: "revision_requested",
          reviewerId: "reviewer-1",
          notes: "Clarify evidence",
          decidedAt: new Date().toISOString(),
          analysisVersion: 1,
        },
      }),
    ).toBe("revision");
  });
});
