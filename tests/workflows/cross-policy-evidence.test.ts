import { describe, expect, it, vi } from "vitest";

import type { Citation } from "@/lib/ai";
import type { OpenAIService } from "@/lib/openai";
import type { HybridSearchProvider, RetrievedChunk } from "@/lib/rag";
import {
  createInitialWorkflowState,
  createRAGPolicySearchTool,
  createWorkflowNodes,
  PolicyWorkflowStateSchema,
  RAGWorkflowEvidenceService,
  type WorkflowNodeServices,
} from "@/lib/workflows";

const oldDocumentId = "44444444-4444-4444-8444-444444444444";
const newDocumentId = "55555555-5555-4555-8555-555555555555";
const adjacentDocumentId = "66666666-6666-4666-8666-666666666666";

function initialState() {
  return createInitialWorkflowState({
    runId: "11111111-1111-4111-8111-111111111111",
    threadId: "cross-policy-evidence",
    organizationId: "22222222-2222-4222-8222-222222222222",
    requestedBy: "33333333-3333-4333-8333-333333333333",
    oldDocument: {
      documentId: oldDocumentId,
      title: "Attendance Policy",
      version: "1.0",
      category: "Academic",
      departmentId: "77777777-7777-4777-8777-777777777777",
      effectiveDate: "2025-07-01",
      storagePath: "org/old.pdf",
      designation: "old",
    },
    newDocument: {
      documentId: newDocumentId,
      title: "Attendance Policy",
      version: "2.0",
      category: "Academic",
      departmentId: "77777777-7777-4777-8777-777777777777",
      effectiveDate: "2026-07-01",
      storagePath: "org/new.pdf",
      designation: "new",
    },
  });
}

function chunk(documentId: string, title: string, id: string): RetrievedChunk {
  return {
    id,
    content:
      "Examinations require at least 75% attendance unless an approved accommodation applies.",
    metadata: {
      organizationId: "22222222-2222-4222-8222-222222222222",
      documentId,
      documentTitle: title,
      version: "1.0",
      departmentId: "77777777-7777-4777-8777-777777777777",
      category: "Academic",
      effectiveDate: "2026-07-01",
      storagePath: `org/${documentId}.pdf`,
      pageNumber: 3,
      sectionHeading: "Eligibility",
      chunkIndex: 0,
    },
    vector: [1, 0],
    vectorScore: 0.92,
    fullTextScore: 0.8,
    fusedScore: 0.9,
    rerankScore: null,
    score: 0.9,
    matchedQueries: ["attendance conflict"],
  };
}

const trace = {
  toolUsed: "citation_lookup",
  evidenceFound: 1,
  decisionSummary: "Evidence checked.",
  confidence: 0.9,
  finalConclusion: "Review complete.",
};

describe("adjacent-policy conflict evidence", () => {
  it("executes the hybrid search tool inside its fixed organization scope", async () => {
    const adjacent = chunk(
      adjacentDocumentId,
      "Examination Eligibility Policy",
      "chunk-adjacent",
    );
    const searchChannels = vi
      .fn()
      .mockResolvedValue({ vector: [adjacent], fullText: [adjacent] });
    const resolveAuthorizedDepartmentIds = vi
      .fn()
      .mockResolvedValue(["77777777-7777-4777-8777-777777777777"]);
    const tool = createRAGPolicySearchTool(
      {
        openAI: {
          generateObject: vi.fn().mockResolvedValue({
            rewrittenQueries: ["examination attendance eligibility"],
            keywords: ["attendance", "eligibility"],
          }),
          embed: vi.fn().mockResolvedValue([
            [1, 0],
            [1, 0],
          ]),
        } as unknown as OpenAIService,
        provider: { searchChannels },
      },
      {
        organizationId: "22222222-2222-4222-8222-222222222222",
        authorizedDepartmentIds: [],
        resolveAuthorizedDepartmentIds,
      },
    );

    const result = await tool.execute(
      {
        query: "Could examination eligibility conflict with attendance?",
        documentIds: [],
        versions: [],
        limit: 4,
      },
      {
        organizationId: "22222222-2222-4222-8222-222222222222",
        userId: "33333333-3333-4333-8333-333333333333",
      },
    );

    expect(result).toMatchObject({ sufficientEvidence: true });
    expect(resolveAuthorizedDepartmentIds).toHaveBeenCalledOnce();
    expect(searchChannels).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          organizationId: "22222222-2222-4222-8222-222222222222",
          departmentIds: ["77777777-7777-4777-8777-777777777777"],
        }),
      }),
    );
    await expect(
      tool.execute(
        { query: "cross tenant", documentIds: [], versions: [], limit: 4 },
        { organizationId: "99999999-9999-4999-8999-999999999999" },
      ),
    ).rejects.toThrow("Cross-organization");
  });

  it("searches beyond the compared documents while preserving immutable tenant and department filters", async () => {
    const direct = chunk(newDocumentId, "Attendance Policy", "chunk-direct");
    const adjacent = chunk(
      adjacentDocumentId,
      "Examination Eligibility Policy",
      "chunk-adjacent",
    );
    const searchChannels = vi.fn().mockResolvedValue({
      vector: [direct, adjacent],
      fullText: [direct, adjacent],
    });
    const provider = { searchChannels } satisfies HybridSearchProvider;
    const openAI = {
      embed: vi.fn().mockResolvedValue([[1, 0]]),
    } as unknown as OpenAIService;
    const resolveAuthorizedDepartmentIds = vi
      .fn()
      .mockResolvedValue(["77777777-7777-4777-8777-777777777777"]);
    const service = new RAGWorkflowEvidenceService(
      { openAI, provider },
      [],
      resolveAuthorizedDepartmentIds,
    );

    const citations = await service.retrieveConflictEvidence(initialState());

    expect(citations.map((item) => item.documentId)).toEqual([
      adjacentDocumentId,
    ]);
    expect(resolveAuthorizedDepartmentIds).toHaveBeenCalledOnce();
    expect(searchChannels).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 48,
        filters: {
          organizationId: "22222222-2222-4222-8222-222222222222",
          documentIds: [],
          excludedDocumentIds: [oldDocumentId, newDocumentId],
          departmentIds: ["77777777-7777-4777-8777-777777777777"],
          versions: [],
          category: null,
        },
      }),
    );
  });

  it("merges adjacent evidence into the conflict agent input and durable workflow evidence", async () => {
    const directCitation: Citation = {
      chunkId: "chunk-direct",
      documentId: newDocumentId,
      documentTitle: "Attendance Policy",
      version: "2.0",
      pageNumber: 2,
      sectionHeading: "Minimum attendance",
      evidenceSnippet: "Students must maintain at least 80% attendance.",
    };
    const adjacentCitation: Citation = {
      chunkId: "chunk-adjacent",
      documentId: adjacentDocumentId,
      documentTitle: "Examination Eligibility Policy",
      version: "1.0",
      pageNumber: 3,
      sectionHeading: "Eligibility",
      evidenceSnippet: "Examinations require at least 75% attendance.",
    };
    const policy = {
      documentSummary: "Attendance requirements.",
      effectiveDate: null,
      departments: ["Academic"],
      rules: [],
      ambiguousClauses: [],
      confidence: 0.9,
      trace,
    };
    const state = PolicyWorkflowStateSchema.parse({
      ...initialState(),
      oldPolicy: policy,
      newPolicy: policy,
      evidence: [directCitation],
      sufficientEvidence: true,
      changeDetection: {
        changes: [],
        unchangedRuleIds: [],
        summary: "No pairwise changes were required for this fixture.",
        confidence: 0.9,
        trace,
      },
    });
    let agentInput: unknown;
    const services: WorkflowNodeServices = {
      agents: {
        run: vi.fn(async (_name, input) => {
          agentInput = input;
          return {
            conflicts: [],
            checkedRulePairs: 0,
            summary: "Adjacent policy evidence was checked.",
            confidence: 0.9,
            trace,
          };
        }),
      },
      evidence: {
        loadDocumentEvidence: vi.fn(),
        retrieveComparisonEvidence: vi.fn(),
        retrieveConflictEvidence: vi.fn().mockResolvedValue([adjacentCitation]),
      },
    };

    const result = await createWorkflowNodes(services).conflict_detection({
      workflow: state,
    });
    const crossPolicyEvidence = (
      agentInput as { crossPolicyEvidence: Citation[] }
    ).crossPolicyEvidence;

    expect(crossPolicyEvidence.map((item) => item.documentId)).toEqual([
      newDocumentId,
      adjacentDocumentId,
    ]);
    expect(result.workflow?.evidence.map((item) => item.documentId)).toEqual([
      newDocumentId,
      adjacentDocumentId,
    ]);
  });
});
