import { describe, expect, it } from "vitest";

import {
  calculateEvaluationMetrics,
  citationCorrectness,
  faithfulness,
  retrievalPrecision,
  retrievalRecall,
  setF1,
} from "@/lib/evaluation";

describe("evaluation metrics", () => {
  it("calculates retrieval precision and recall", () => {
    expect(retrievalPrecision(["a", "x", "b"], ["a", "b", "c"])).toBeCloseTo(2 / 3);
    expect(retrievalRecall(["a", "x", "b"], ["a", "b", "c"])).toBeCloseTo(2 / 3);
    expect(setF1(["added", "modified"], ["modified", "removed"])).toBe(0.5);
  });

  it("penalizes unsupported numeric claims and invalid citations", () => {
    const contexts = ["The minimum attendance requirement is 80 percent."];
    expect(faithfulness("The requirement is 95 percent.", contexts)).toBe(0);
    expect(
      citationCorrectness("Attendance is 80 percent [S2].", [
        {
          chunkId: "a",
          documentId: "doc-1",
          documentTitle: "Attendance Policy",
          version: "2.0",
          pageNumber: 1,
          sectionHeading: "Attendance",
          evidenceSnippet: "Attendance is 80 percent.",
        },
      ]),
    ).toBeLessThan(0.5);
  });

  it("returns all required benchmark measurements", () => {
    const metrics = calculateEvaluationMetrics(
      {
        id: "q1",
        question: "What is the attendance requirement?",
        category: "qa",
        expectedClaims: ["Attendance is 80 percent."],
        relevantEvidenceIds: ["attendance-new-threshold"],
        expectedChangeTypes: [],
        expectedConflictLabels: [],
        expectedDocumentTitles: ["Attendance Policy"],
        tags: [],
      },
      {
        answer: "Attendance is 80 percent [S1].",
        citations: [
          {
            chunkId: "a",
            documentId: "doc-1",
            documentTitle: "Attendance Policy",
            version: "2.0",
            pageNumber: 1,
            sectionHeading: "Attendance",
            evidenceSnippet: "Attendance is 80 percent.",
          },
        ],
        retrievedEvidence: [
          {
            id: "a",
            relevanceId: "attendance-new-threshold",
            content: "Attendance is 80 percent.",
          },
        ],
        detectedChangeTypes: [],
        detectedConflictLabels: [],
        latencyMs: 125,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        estimatedCostUsd: 0.001,
      },
    );
    expect(metrics.retrievalPrecision).toBe(1);
    expect(metrics.retrievalRecall).toBe(1);
    expect(metrics.faithfulness).toBe(1);
    expect(metrics.unsupportedClaimRate).toBe(0);
    expect(metrics.totalTokens).toBe(30);
  });
});
