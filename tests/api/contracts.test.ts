import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  actionProgressSchema,
  approvalDecisionSchema,
  comparisonCreateSchema,
  evaluationRunSchema,
  settingsSchema,
} from "@/lib/api/schemas";
import { ApiError, secureJsonError } from "@/lib/security/errors";
import { departmentCodeFromName } from "@/lib/security/department";
import { documentMetadataSchema } from "@/lib/security/files";

const oldDocumentId = "11111111-1111-4111-8111-111111111111";
const newDocumentId = "22222222-2222-4222-8222-222222222222";

describe("Route Handler input and error contracts", () => {
  it("accepts complete upload metadata and rejects invalid file provenance", () => {
    const valid = {
      title: "Attendance policy",
      description: "Academic attendance controls",
      category: "Academic",
      version: "2.0",
      effectiveDate: "2026-07-01",
      departmentIds: [oldDocumentId],
      designation: "new" as const,
      fileName: "attendance.pdf",
      mimeType: "application/pdf" as const,
      fileSize: 1_024,
      checksum: "a".repeat(64),
    };
    expect(documentMetadataSchema.parse(valid)).toEqual(valid);
    expect(
      documentMetadataSchema.parse({
        ...valid,
        departmentIds: [],
        departmentName: "Academic Affairs",
      }).departmentName,
    ).toBe("Academic Affairs");
    expect(() =>
      documentMetadataSchema.parse({
        ...valid,
        departmentIds: [],
      }),
    ).toThrow(/department/i);
    expect(() => documentMetadataSchema.parse({ ...valid, checksum: "not-a-hash" })).toThrow();
  });

  it("generates department codes accepted by the database constraint", () => {
    const code = departmentCodeFromName("Academic affairs");
    expect(code).toMatch(/^[A-Z0-9][A-Z0-9_-]{1,19}$/);
    expect(code.length).toBeLessThanOrEqual(20);
  });

  it("guards comparison, approval, progress, and evaluation payloads", () => {
    expect(
      comparisonCreateSchema.parse({ oldDocumentId, newDocumentId, title: "2025 to 2026" }),
    ).toBeTruthy();
    expect(() => comparisonCreateSchema.parse({ oldDocumentId, newDocumentId: oldDocumentId })).toThrow();
    expect(
      approvalDecisionSchema.parse({
        decision: "approved",
        notes: "Evidence checked",
        expectedAnalysisVersion: 2,
      }),
    ).toBeTruthy();
    expect(() => actionProgressSchema.parse({ status: "completed", progressPercent: 90 })).toThrow();
    expect(
      evaluationRunSchema.parse({ modes: ["rag", "agentic_self_reflection"], questionIds: [] }),
    ).toBeTruthy();
    expect(
      evaluationRunSchema.parse({
        modes: ["rag"],
        questionIds: [],
        comparisonId: oldDocumentId,
      }).comparisonId,
    ).toBe(oldDocumentId);
    expect(() =>
      settingsSchema.parse({
        chunkSize: 200,
        chunkOverlap: 200,
        qualityThreshold: 0.8,
        maxAutomaticRevisions: 2,
        defaultRetrievalLimit: 12,
      }),
    ).toThrow(/overlap/i);
  });

  it("returns safe error envelopes without leaking unknown exceptions", async () => {
    const known = secureJsonError(new ApiError("Document not found.", 404, "NOT_FOUND"), "req-1");
    expect(known.status).toBe(404);
    await expect(known.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", requestId: "req-1" },
    });

    const validation = secureJsonError(z.object({ id: z.uuid() }).safeParse({ id: "bad" }).error, "req-2");
    expect(validation.status).toBe(400);
    const unknown = secureJsonError(new Error("database password=secret"), "req-3");
    expect(unknown.status).toBe(500);
    await expect(unknown.text()).resolves.not.toContain("password=secret");
  });
});
