import { describe, expect, it } from "vitest";

import { generatePolicyReportMarkdown } from "@/lib/reports/markdown";
import { generatePolicyReportPdf } from "@/lib/reports/pdf";
import { createInitialWorkflowState } from "@/lib/workflows";

const reportState = createInitialWorkflowState({
  runId: "run-report-1",
  threadId: "thread-report-1",
  organizationId: "org-1",
  requestedBy: "manager-1",
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

describe("report generators", () => {
  it("includes every audit-report section in Markdown", () => {
    const markdown = generatePolicyReportMarkdown({ state: reportState, generatedAt: "2026-08-25T10:00:00.000Z" });
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Compared Documents");
    expect(markdown).toContain("## Important Changes");
    expect(markdown).toContain("## Conflicts");
    expect(markdown).toContain("## Affected Departments");
    expect(markdown).toContain("## Risk Assessment");
    expect(markdown).toContain("## Department Action Plan");
    expect(markdown).toContain("## Approval History");
    expect(markdown).toContain("## Evidence and Citations");
    expect(markdown).toContain("## Evaluation Results");
  });

  it("produces a valid in-memory PDF without filesystem persistence", async () => {
    const bytes = await generatePolicyReportPdf({
      state: reportState,
      generatedAt: "2026-08-25T10:00:00.000Z",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });
});
