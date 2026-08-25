import { describe, expect, it, vi } from "vitest";

import {
  policyAgentDefinitions,
  runPolicyAgent,
  type Citation,
} from "@/lib/ai";
import type { OpenAIService } from "@/lib/openai";

const citation: Citation = {
  chunkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  documentTitle: "Attendance Policy",
  version: "2.0",
  pageNumber: 2,
  sectionHeading: "Minimum attendance",
  evidenceSnippet: "Students must maintain at least 80% attendance.",
};

function analystOutput(source: Citation = citation) {
  return {
    documentSummary: "The policy establishes a minimum attendance requirement.",
    effectiveDate: null,
    departments: ["Academic Affairs"],
    rules: [
      {
        id: "attendance-minimum",
        category: "requirement" as const,
        statement: "Students must maintain at least 80% attendance.",
        subject: "Students",
        obligation: "Maintain at least 80% attendance",
        conditions: [],
        exceptions: [],
        deadline: null,
        responsibleDepartments: ["Academic Affairs"],
        citation: source,
        confidence: 0.95,
      },
    ],
    ambiguousClauses: [],
    confidence: 0.95,
    trace: {
      toolUsed: "claimed_tool",
      evidenceFound: 999,
      decisionSummary: "The cited clause states the rule.",
      confidence: 0.95,
      finalConclusion: "One enforceable rule was found.",
    },
  };
}

const input = {
  documentId: citation.documentId,
  documentTitle: citation.documentTitle,
  version: citation.version,
  evidence: [citation],
};

describe("bounded executable policy-agent tools", () => {
  it("executes a schema-validated citation lookup and records the real tool trace", async () => {
    let planStep = 0;
    const generateObject = vi.fn(
      async (request: { operation: string; prompt: string }) => {
        if (request.operation === "agent.policy_analyst.tool_decision") {
          planStep += 1;
          return planStep === 1
            ? {
                action: "call_tool",
                toolName: "citation_lookup",
                toolInputJson: JSON.stringify({ chunkIds: [citation.chunkId] }),
                decisionSummary:
                  "Resolve the cited excerpt before extracting the rule.",
              }
            : {
                action: "finish",
                toolName: null,
                toolInputJson: "{}",
                decisionSummary: "The canonical citation is available.",
              };
        }
        expect(request.prompt).toContain("executedToolResults");
        expect(request.prompt).toContain(citation.chunkId);
        return analystOutput();
      },
    );

    const result = await runPolicyAgent(
      { generateObject } as unknown as OpenAIService,
      policyAgentDefinitions.policy_analyst,
      input,
      { organizationId: "org-1", maxToolCalls: 3 },
    );

    expect(result.trace).toMatchObject({
      toolUsed: "citation_lookup",
      evidenceFound: 1,
    });
    expect(
      generateObject.mock.calls.map(([request]) => request.operation),
    ).toEqual([
      "agent.policy_analyst.tool_decision",
      "agent.policy_analyst.tool_decision",
      "agent.policy_analyst",
    ]);
  });

  it("replaces generated citation metadata with the authorized canonical citation", async () => {
    const generateObject = vi.fn(async (request: { operation: string }) => {
      if (request.operation.endsWith("tool_decision")) {
        return {
          action: "finish",
          toolName: null,
          toolInputJson: "{}",
          decisionSummary: "No lookup requested.",
        };
      }
      return analystOutput({
        ...citation,
        documentTitle: "Invented policy title",
      });
    });

    const result = await runPolicyAgent(
      { generateObject } as unknown as OpenAIService,
      policyAgentDefinitions.policy_analyst,
      input,
      { organizationId: "org-1" },
    );

    expect(result.rules[0]?.citation).toEqual(citation);
  });

  it("fails closed when the final output cites another document", async () => {
    const generateObject = vi.fn(async (request: { operation: string }) => {
      if (request.operation.endsWith("tool_decision")) {
        return {
          action: "finish",
          toolName: null,
          toolInputJson: "{}",
          decisionSummary: "No lookup requested.",
        };
      }
      return analystOutput({
        ...citation,
        documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      });
    });

    await expect(
      runPolicyAgent(
        { generateObject } as unknown as OpenAIService,
        policyAgentDefinitions.policy_analyst,
        input,
        { organizationId: "org-1" },
      ),
    ).rejects.toThrow("unauthorized or altered citation");
  });

  it("caps the planning loop at three tool calls before final generation", async () => {
    let decision = 0;
    const generateObject = vi.fn(async (request: { operation: string }) => {
      if (request.operation.endsWith("tool_decision")) {
        decision += 1;
        return {
          action: "call_tool",
          toolName: "citation_lookup",
          toolInputJson: JSON.stringify({ chunkIds: [`missing-${decision}`] }),
          decisionSummary: "Check one bounded citation identifier.",
        };
      }
      return { ...analystOutput(), rules: [] };
    });

    const result = await runPolicyAgent(
      { generateObject } as unknown as OpenAIService,
      policyAgentDefinitions.policy_analyst,
      input,
      { organizationId: "org-1", maxToolCalls: 20 },
    );

    expect(decision).toBe(3);
    expect(result.trace.toolUsed).toBe("citation_lookup");
    expect(result.trace.evidenceFound).toBe(0);
    expect(generateObject).toHaveBeenCalledTimes(4);
  });
});
