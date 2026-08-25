import { z } from "zod";

import { CitationSchema } from "@/lib/ai";

export const EvaluationModeSchema = z.enum([
  "openai_without_rag",
  "openai_with_rag",
  "rag_agents_reflection",
]);

export const EvaluationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  category: z.enum(["qa", "change_detection", "conflict_detection", "impact", "action"]),
  expectedClaims: z.array(z.string()),
  relevantEvidenceIds: z.array(z.string()),
  expectedChangeTypes: z.array(z.string()),
  expectedConflictLabels: z.array(z.string()),
  expectedDocumentTitles: z.array(z.string()),
  tags: z.array(z.string()),
});

export const RetrievedEvaluationEvidenceSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  relevanceId: z.string().nullable(),
});

export const EvaluationRunOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  retrievedEvidence: z.array(RetrievedEvaluationEvidenceSchema),
  detectedChangeTypes: z.array(z.string()),
  detectedConflictLabels: z.array(z.string()),
  latencyMs: z.number().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
});

export const EvaluationMetricsSchema = z.object({
  retrievalPrecision: z.number().min(0).max(1),
  retrievalRecall: z.number().min(0).max(1),
  contextRelevance: z.number().min(0).max(1),
  answerRelevance: z.number().min(0).max(1),
  faithfulness: z.number().min(0).max(1),
  citationCorrectness: z.number().min(0).max(1),
  changeDetectionAccuracy: z.number().min(0).max(1),
  conflictDetectionAccuracy: z.number().min(0).max(1),
  unsupportedClaimRate: z.number().min(0).max(1),
  latencyMs: z.number().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  estimatedCostUsd: z.number().min(0),
});

export const EvaluationResultSchema = z.object({
  questionId: z.string().min(1),
  mode: EvaluationModeSchema,
  answer: z.string(),
  metrics: EvaluationMetricsSchema,
  citations: z.array(CitationSchema),
  createdAt: z.iso.datetime(),
  error: z.string().nullable(),
});

export type EvaluationMode = z.infer<typeof EvaluationModeSchema>;
export type EvaluationQuestion = z.infer<typeof EvaluationQuestionSchema>;
export type EvaluationRunOutput = z.infer<typeof EvaluationRunOutputSchema>;
export type EvaluationMetrics = z.infer<typeof EvaluationMetricsSchema>;
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
