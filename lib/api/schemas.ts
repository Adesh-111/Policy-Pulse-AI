import { z } from "zod";

export const uuidSchema = z.uuid();

export const comparisonCreateSchema = z
  .object({
    oldDocumentId: uuidSchema,
    newDocumentId: uuidSchema,
    title: z.string().trim().min(3).max(200).optional(),
  })
  .refine((value) => value.oldDocumentId !== value.newDocumentId, {
    message: "Old and new documents must be different.",
    path: ["newDocumentId"],
  });

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "revision_requested"]),
  notes: z.string().trim().max(4_000).default(""),
  expectedAnalysisVersion: z.number().int().positive(),
});

export const actionProgressSchema = z
  .object({
    status: z.enum(["not_started", "in_progress", "blocked", "completed"]),
    progressPercent: z.number().int().min(0).max(100),
    note: z.string().trim().max(2_000).default(""),
  })
  .refine(
    (value) =>
      value.status === "completed"
        ? value.progressPercent === 100
        : value.progressPercent < 100,
    {
      message: "Only completed actions can have 100% progress.",
      path: ["progressPercent"],
    },
  );

export const chatRequestSchema = z.object({
  sessionId: uuidSchema.optional(),
  question: z.string().trim().min(3).max(4_000),
  documentIds: z.array(uuidSchema).max(20).default([]),
  departmentIds: z.array(uuidSchema).max(20).default([]),
  versionFilters: z.array(z.string().trim().max(40)).max(10).default([]),
});

export const evaluationRunSchema = z.object({
  modes: z
    .array(z.enum(["no_rag", "rag", "agentic_self_reflection"]))
    .min(1)
    .default(["no_rag", "rag", "agentic_self_reflection"]),
  questionIds: z.array(uuidSchema).max(100).default([]),
  comparisonId: uuidSchema.optional(),
});

export const departmentSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).default(""),
  parentId: uuidSchema.nullable().default(null),
});

export const membershipUpdateSchema = z.object({
  role: z.enum([
    "administrator",
    "policy_manager",
    "department_user",
    "auditor",
  ]),
  departmentIds: z.array(uuidSchema).max(50),
  status: z.enum(["invited", "active", "suspended"]),
});

export const settingsSchema = z
  .object({
    chunkSize: z.number().int().min(200).max(2_000).default(800),
    chunkOverlap: z.number().int().min(0).max(500).default(120),
    qualityThreshold: z.number().min(0.5).max(1).default(0.8),
    maxAutomaticRevisions: z.number().int().min(0).max(5).default(2),
    defaultRetrievalLimit: z.number().int().min(3).max(50).default(12),
  })
  .refine((value) => value.chunkOverlap < value.chunkSize, {
    message: "Chunk overlap must be smaller than chunk size.",
    path: ["chunkOverlap"],
  });
