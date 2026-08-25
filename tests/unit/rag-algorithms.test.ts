import { describe, expect, it } from "vitest";

import {
  applyRerankScores,
  deduplicateChunks,
  maximalMarginalRelevance,
  reciprocalRankFusion,
  type RetrievedChunk,
} from "@/lib/rag";

function chunk(
  id: string,
  content: string,
  vectorScore: number,
  fullTextScore = 0,
  documentId = "doc-1",
): RetrievedChunk {
  return {
    id,
    content,
    metadata: {
      organizationId: "org-1",
      documentId,
      documentTitle: "Attendance Policy",
      version: "2.0",
      departmentId: null,
      category: "Academic",
      effectiveDate: "2026-07-01",
      storagePath: null,
      pageNumber: 1,
      sectionHeading: "Attendance",
      chunkIndex: 0,
    },
    vectorScore,
    fullTextScore,
    fusedScore: 0,
    rerankScore: null,
    score: vectorScore,
    matchedQueries: ["attendance"],
  };
}

describe("hybrid retrieval algorithms", () => {
  it("uses reciprocal-rank fusion and merges channel evidence", () => {
    const semantic = [chunk("a", "Attendance must be at least 80 percent.", 0.9), chunk("b", "Medical exception.", 0.7)];
    const lexical = [chunk("b", "Medical exception.", 0, 0.9), chunk("a", "Attendance must be at least 80 percent.", 0, 0.8)];
    const fused = reciprocalRankFusion([semantic, lexical], { weights: [0.65, 0.35] });

    expect(fused).toHaveLength(2);
    expect(fused[0]?.score).toBe(1);
    expect(fused.find((item) => item.id === "a")?.fullTextScore).toBe(0.8);
    expect(fused.find((item) => item.id === "b")?.vectorScore).toBe(0.7);
  });

  it("deduplicates equivalent chunks in the same document", () => {
    const first = chunk("a", "Minimum attendance: 80%", 0.8);
    const duplicate = chunk("a-copy", "Minimum attendance -- 80%", 0.9);
    const deduplicated = deduplicateChunks([first, duplicate]);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.vectorScore).toBe(0.9);
  });

  it("applies MMR diversity and validated rerank scores", () => {
    const candidates = [
      chunk("a", "Attendance requirement is 80 percent for students.", 0.92),
      chunk("b", "Students have an 80 percent attendance requirement.", 0.91),
      chunk("c", "Medical exceptions require supporting documents.", 0.78),
    ];
    const diverse = maximalMarginalRelevance("attendance requirement and exceptions", [], candidates, 2, 0.55);
    expect(diverse.map((item) => item.id)).toContain("c");

    const reranked = applyRerankScores(candidates, [
      { chunkId: "c", score: 0.99 },
      { chunkId: "a", score: 0.7 },
    ]);
    expect(reranked[0]?.id).toBe("c");
  });
});
