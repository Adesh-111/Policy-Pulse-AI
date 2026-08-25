import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SourceCard } from "@/components/assistant/policy-chat";
import { ComparisonList } from "@/components/comparisons/comparison-list";
import { ComparisonResults } from "@/components/comparisons/comparison-results";
import { EvaluationDashboard } from "@/components/evaluations/evaluation-dashboard";
import { useApi } from "@/components/hooks/use-api";
import { ApprovalQueue } from "@/components/operations/approval-queue";
import { PolicyLibrary } from "@/components/policies/policy-library";

vi.mock("@/components/hooks/use-api", () => ({ useApi: vi.fn() }));

const mockedUseApi = vi.mocked(useApi);

function apiResult(data: unknown) {
  return {
    data,
    error: "",
    loading: false,
    refresh: vi.fn(),
    setData: vi.fn(),
  };
}

describe("persisted UI data contracts", () => {
  beforeEach(() => mockedUseApi.mockReset());
  afterEach(cleanup);

  it("renders canonical camelCase citation fields in assistant source cards", () => {
    render(<SourceCard source={{
      documentTitle: "Attendance Policy",
      version: "2.0",
      pageNumber: 4,
      sectionHeading: "Minimum attendance",
      evidenceSnippet: "Students must maintain eighty percent attendance.",
    }} index={0} />);

    expect(screen.getByText("Attendance Policy")).toBeInTheDocument();
    expect(screen.getByText(/Minimum attendance/)).toHaveTextContent("Page 4");
    expect(screen.getByText(/eighty percent attendance/)).toBeInTheDocument();
  });

  it("renders snake/camel paired finding citations and nested workflow quality", () => {
    mockedUseApi.mockReturnValue(apiResult({
      id: "comparison-1",
      title: "Attendance policy update",
      status: "completed",
      policy_changes: [{
        id: "change-1",
        change_type: "modified",
        old_text: "75 percent",
        newText: "80 percent",
        old_citation: {
          document_title: "Attendance Policy (old)",
          version: "1.0",
          page_number: 2,
          section_heading: "Threshold",
          evidence_snippet: "The required attendance is 75 percent.",
        },
        newCitation: {
          documentTitle: "Attendance Policy (new)",
          version: "2.0",
          pageNumber: 3,
          sectionHeading: "Threshold",
          evidenceSnippet: "The required attendance is 80 percent.",
        },
      }],
      policy_conflicts: [{
        id: "conflict-1",
        conflict_type: "direct_contradiction",
        left_citation: {
          document_title: "Student AI Policy",
          version: "2.0",
          section_heading: "Permitted assistance",
          evidence_snippet: "Disclosed AI assistance is conditionally permitted.",
        },
        rightCitation: {
          documentTitle: "Faculty Responsibilities Policy",
          version: "2.0",
          sectionHeading: "Assessment rules",
          evidenceSnippet: "AI-generated work is prohibited.",
        },
      }],
      risk_assessments: [],
      action_plans: [],
      state: {
        qualityReview: {
          qualityScore: 0.91,
          citationScore: 0.94,
          completenessScore: 0.88,
          passed: true,
          issues: [],
        },
      },
    }));

    render(<ComparisonResults id="comparison-1" />);
    expect(screen.getByText(/Attendance Policy \(old\)/)).toBeInTheDocument();
    expect(screen.getByText(/Attendance Policy \(new\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Conflicts/ }));
    expect(screen.getByText(/Student AI Policy/)).toBeInTheDocument();
    expect(screen.getByText(/Faculty Responsibilities Policy/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Quality review/ }));
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
  });

  it("keeps evaluation mutation controls role-aware and reads persisted variant/cost fields", () => {
    mockedUseApi.mockReturnValue(apiResult([{
      id: "evaluation-1",
      variant: "openai_with_rag",
      estimated_cost_usd: 0.1234,
      latency_ms: 720,
      faithfulness: 0.9,
      citation_correctness: 0.95,
      answer_relevance: 0.88,
      created_at: "2026-08-25T10:00:00.000Z",
    }]));

    const { rerender } = render(<EvaluationDashboard role="auditor" />);
    expect(screen.queryByRole("button", { name: "Run evaluation" })).not.toBeInTheDocument();
    expect(screen.getByText(/Auditor access is read-only/)).toBeInTheDocument();
    expect(screen.getByText("OpenAI with RAG")).toBeInTheDocument();
    expect(screen.getByText("$0.1234")).toBeInTheDocument();

    rerender(<EvaluationDashboard role="policy_manager" />);
    expect(screen.getByRole("button", { name: "Run evaluation" })).toBeEnabled();
  });

  it("gives auditors read-only approval evidence while managers receive decision controls", () => {
    mockedUseApi.mockImplementation((path) => apiResult(
      path === "/api/v1/approvals"
        ? [{ id: "approval-1", status: "pending", risk_level: "high", analysis_version: 1 }]
        : {
            id: "approval-1",
            status: "pending",
            risk_level: "high",
            analysis_version: 1,
            policy_comparisons: {
              policy_changes: [],
              risk_assessments: [],
              policy_conflicts: [{
                id: "conflict-1",
                left_citation: {
                  document_title: "Student AI Policy",
                  version: "2.0",
                  evidence_snippet: "AI assistance is permitted with disclosure.",
                },
                right_citation: {
                  documentTitle: "Faculty Policy",
                  version: "2.0",
                  evidenceSnippet: "AI-generated work is prohibited.",
                },
              }],
              action_plans: [{
                id: "plan-1",
                title: "Academic Affairs plan",
                action_items: [{ id: "item-1", title: "Align assessment guidance" }],
              }],
            },
          },
    ));

    const { rerender } = render(<ApprovalQueue role="auditor" />);
    expect(screen.getByText(/read-only reviewer access/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/Student AI Policy/)).toBeInTheDocument();
    expect(screen.getByText(/Faculty Policy/)).toBeInTheDocument();
    expect(screen.getByText("Align assessment guidance")).toBeInTheDocument();

    rerender(<ApprovalQueue role="policy_manager" />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Request revision" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("renders and searches nested Supabase department relations", () => {
    mockedUseApi.mockReturnValue(apiResult([{
      id: "document-1",
      title: "Examination Policy",
      category: "Academic",
      version: "3.0",
      designation: "new",
      processing_status: "indexed",
      departments: { id: "department-1", name: "Examinations", code: "EXAM" },
    }]));

    render(<PolicyLibrary />);
    expect(screen.getByText("Examinations")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search title/), { target: { value: "Examinations" } });
    expect(screen.getByText("Examination Policy")).toBeInTheDocument();
  });

  it("renders and searches nested old/new document relations", () => {
    mockedUseApi.mockReturnValue(apiResult([{
      id: "comparison-1",
      title: "Attendance update",
      status: "completed",
      old_document: { id: "old-1", title: "Attendance Policy 2025", version: "1.0" },
      new_document: { id: "new-1", title: "Attendance Policy 2026", version: "2.0" },
    }]));

    render(<ComparisonList />);
    expect(screen.getByText("Attendance Policy 2025")).toBeInTheDocument();
    expect(screen.getByText("Attendance Policy 2026")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search comparisons…"), { target: { value: "2026" } });
    expect(screen.getByText("Attendance update")).toBeInTheDocument();
  });
});
