import { describe, expect, it, vi } from "vitest";

import type { OpenAIService } from "@/lib/openai";
import {
  answerPolicyQuestion,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  streamPolicyAnswer,
  type HybridSearchProvider,
  type RetrievedChunk,
} from "@/lib/rag";

const evidence: RetrievedChunk = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  content: "Students must maintain at least 80% attendance in each course.",
  metadata: {
    organizationId: "org-1",
    documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    documentTitle: "Attendance Policy",
    version: "2.0",
    departmentId: null,
    category: "Academic",
    effectiveDate: "2026-07-01",
    storagePath: "org/doc/policy.pdf",
    pageNumber: 2,
    sectionHeading: "Minimum attendance",
    chunkIndex: 0,
  },
  vector: [1, 0],
  vectorScore: 0.91,
  fullTextScore: 0.82,
  fusedScore: 0.9,
  rerankScore: null,
  score: 0.9,
  matchedQueries: ["attendance"],
};

const filters = {
  organizationId: "org-1",
  documentIds: [],
  departmentIds: [],
  versions: [],
  category: null,
};

function openAI() {
  return {
    embed: vi.fn().mockResolvedValue([[1, 0], [1, 0]]),
    generateObject: vi.fn(async (request: { operation: string }) => {
      if (request.operation === "rag.query_rewrite") {
        return { rewrittenQueries: ["minimum attendance threshold"], keywords: ["attendance"] };
      }
      if (request.operation === "rag.rerank") {
        return { rankings: [{ chunkId: evidence.id, score: 0.98, supportSummary: "Direct rule" }] };
      }
      return { answer: "The minimum is 80% in each course [S1].", citedSourceIds: ["S1"], confidence: 0.97 };
    }),
  } as unknown as OpenAIService;
}

function streamingOpenAI(text: string) {
  return {
    ...openAI(),
    streamText: vi.fn(async function* () {
      const midpoint = Math.ceil(text.length / 2);
      yield { type: "text-delta" as const, delta: text.slice(0, midpoint) };
      yield { type: "text-delta" as const, delta: text.slice(midpoint) };
    }),
  } as unknown as OpenAIService;
}

describe("RAG retrieval, grounding, and citations", () => {
  it("passes immutable filters to hybrid search and returns complete source metadata", async () => {
    const searchChannels = vi.fn().mockResolvedValue({ vector: [evidence], fullText: [evidence] });
    const provider = { searchChannels } satisfies HybridSearchProvider;
    const result = await answerPolicyQuestion("What attendance is required?", filters, {
      openAI: openAI(),
      provider,
    });
    expect(result.sufficientEvidence).toBe(true);
    expect(result.answer).toContain("80%");
    expect(result.citations[0]).toMatchObject({
      documentTitle: "Attendance Policy",
      version: "2.0",
      pageNumber: 2,
      sectionHeading: "Minimum attendance",
    });
    expect(searchChannels).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ organizationId: "org-1" }) }),
    );
  });

  it("uses the exact fallback and never calls grounded generation without evidence", async () => {
    const ai = openAI();
    const result = await answerPolicyQuestion(
      "What is the cafeteria refund?",
      filters,
      { openAI: ai, provider: { searchChannels: vi.fn().mockResolvedValue({ vector: [], fullText: [] }) } },
      { rerank: false },
    );
    expect(result).toMatchObject({
      answer: INSUFFICIENT_EVIDENCE_MESSAGE,
      citations: [],
      sufficientEvidence: false,
    });
    expect(ai.generateObject).toHaveBeenCalledTimes(1);
  });

  it("publishes only canonical authorized citations actually referenced by a streamed answer", async () => {
    const second = {
      ...evidence,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      content: "Medical exceptions require documented approval.",
      metadata: { ...evidence.metadata, pageNumber: 5, sectionHeading: "Exceptions", chunkIndex: 1 },
    } satisfies RetrievedChunk;
    const provider = {
      searchChannels: vi.fn().mockResolvedValue({ vector: [evidence, second], fullText: [evidence, second] }),
    } satisfies HybridSearchProvider;
    const events = [];
    for await (const event of streamPolicyAnswer(
      "What attendance is required?",
      filters,
      { openAI: streamingOpenAI("Students need 80% attendance [S1]."), provider },
      { rewriteQuery: false, rerank: false, limit: 2 },
    )) events.push(event);

    const sourceEvent = events.find((event) => event.type === "sources");
    expect(sourceEvent).toEqual({ type: "sources", citations: [expect.objectContaining({
      chunkId: evidence.id,
      documentId: evidence.metadata.documentId,
      documentTitle: evidence.metadata.documentTitle,
    })] });
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.type === "text-delta" ? event.delta : "").join(""))
      .toBe("Students need 80% attendance [S1].");
  });

  it("turns schema-shaped streamed output into a reader-friendly answer", async () => {
    const provider = {
      searchChannels: vi.fn().mockResolvedValue({ vector: [evidence], fullText: [evidence] }),
    } satisfies HybridSearchProvider;
    const raw = JSON.stringify({
      evidence_for_highest_risk_finding: [
        "Students must maintain at least 80% attendance [S1].",
      ],
      decision_summary:
        "Students below the attendance threshold may become ineligible for examinations.",
    });
    const events = [];
    for await (const event of streamPolicyAnswer(
      "Show the evidence for the highest-risk finding.",
      filters,
      { openAI: streamingOpenAI(raw), provider },
      { rewriteQuery: false, rerank: false },
    )) events.push(event);

    const answer = events
      .filter((event) => event.type === "text-delta")
      .map((event) => (event.type === "text-delta" ? event.delta : ""))
      .join("");
    expect(answer).toBe(
      "Students below the attendance threshold may become ineligible for examinations.\n\n" +
        "Supporting evidence:\n1. Students must maintain at least 80% attendance [S1].",
    );
    expect(answer).not.toContain("decision_summary");
    expect(events.find((event) => event.type === "sources")).toEqual({
      type: "sources",
      citations: [expect.objectContaining({ chunkId: evidence.id })],
    });
  });

  it("fails closed when a streamed answer cites a source label outside authorized retrieval", async () => {
    const provider = {
      searchChannels: vi.fn().mockResolvedValue({ vector: [evidence], fullText: [evidence] }),
    } satisfies HybridSearchProvider;
    const events = [];
    for await (const event of streamPolicyAnswer(
      "What attendance is required?",
      filters,
      { openAI: streamingOpenAI("Students need 80% attendance [S99]."), provider },
      { rewriteQuery: false, rerank: false },
    )) events.push(event);

    expect(events.find((event) => event.type === "sources")).toEqual({ type: "sources", citations: [] });
    expect(events.filter((event) => event.type === "text-delta").map((event) => event.type === "text-delta" ? event.delta : "").join(""))
      .toBe(INSUFFICIENT_EVIDENCE_MESSAGE);
    expect(events.at(-1)).toEqual({ type: "done", sufficientEvidence: false });
  });
});
