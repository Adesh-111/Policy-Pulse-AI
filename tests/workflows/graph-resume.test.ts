import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import {
  advancePolicyWorkflow,
  createInitialWorkflowState,
  createPolicyWorkflow,
  type WorkflowNodeServices,
} from "@/lib/workflows";

function initialState() {
  return createInitialWorkflowState({
    runId: "11111111-1111-4111-8111-111111111111",
    threadId: "bounded-resume-test",
    organizationId: "22222222-2222-4222-8222-222222222222",
    requestedBy: "33333333-3333-4333-8333-333333333333",
    oldDocument: {
      documentId: "44444444-4444-4444-8444-444444444444",
      title: "Attendance Policy",
      version: "1.0",
      category: "Academic",
      departmentId: null,
      effectiveDate: "2025-07-01",
      storagePath: "org/old.pdf",
      designation: "old",
    },
    newDocument: {
      documentId: "55555555-5555-4555-8555-555555555555",
      title: "Attendance Policy",
      version: "2.0",
      category: "Academic",
      departmentId: null,
      effectiveDate: "2026-07-01",
      storagePath: "org/new.pdf",
      designation: "new",
    },
  });
}

describe("bounded durable graph execution", () => {
  it("advances exactly one node and checkpoints the next route", async () => {
    const unused = async () => {
      throw new Error("Later services must not run during the validation step");
    };
    const services: WorkflowNodeServices = {
      agents: { run: unused },
      evidence: {
        loadDocumentEvidence: unused,
        retrieveComparisonEvidence: unused,
        retrieveConflictEvidence: unused,
      },
    };
    const graph = createPolicyWorkflow({
      services,
      checkpointer: new MemorySaver(),
      executionMode: "bounded",
    });

    const result = await advancePolicyWorkflow(graph, { state: initialState() });
    expect(result.state.validation?.valid).toBe(true);
    expect(result.state.currentNode).toBe("document_validation");
    expect(result.nextNodes).toEqual(["policy_extraction"]);
    expect(result.completed).toBe(false);
  });
});
