import type { Citation } from "@/lib/ai";

import type {
  EvaluationMetrics,
  EvaluationQuestion,
  EvaluationRunOutput,
} from "./types";

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function terms(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}%]+/u)
    .filter((term) => term.length > 2);
}

function termFrequency(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const term of terms(text)) result.set(term, (result.get(term) ?? 0) + 1);
  return result;
}

export function lexicalCosineSimilarity(left: string, right: string): number {
  const leftFrequency = termFrequency(left);
  const rightFrequency = termFrequency(right);
  if (leftFrequency.size === 0 || rightFrequency.size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of leftFrequency.values()) leftNorm += value * value;
  for (const value of rightFrequency.values()) rightNorm += value * value;
  for (const [term, value] of leftFrequency) dot += value * (rightFrequency.get(term) ?? 0);
  return clamp(dot / Math.sqrt(leftNorm * rightNorm));
}

export function retrievalPrecision(retrieved: string[], relevant: string[], k = retrieved.length): number {
  const selected = retrieved.slice(0, Math.max(k, 0));
  if (selected.length === 0) return relevant.length === 0 ? 1 : 0;
  const relevantSet = new Set(relevant);
  const relevantRetrieved = selected.filter((id) => relevantSet.has(id)).length;
  return relevantRetrieved / selected.length;
}

export function retrievalRecall(retrieved: string[], relevant: string[], k = retrieved.length): number {
  if (relevant.length === 0) return 1;
  const selected = new Set(retrieved.slice(0, Math.max(k, 0)));
  return relevant.filter((id) => selected.has(id)).length / new Set(relevant).size;
}

export function setF1(predicted: string[], expected: string[]): number {
  const predictedSet = new Set(predicted);
  const expectedSet = new Set(expected);
  if (predictedSet.size === 0 && expectedSet.size === 0) return 1;
  const matches = [...predictedSet].filter((value) => expectedSet.has(value)).length;
  const precision = predictedSet.size ? matches / predictedSet.size : 0;
  const recall = expectedSet.size ? matches / expectedSet.size : 0;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function contextRelevance(question: string, contexts: string[]): number {
  if (contexts.length === 0) return 0;
  const scores = contexts.map((context) => lexicalCosineSimilarity(question, context));
  return clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function answerRelevance(question: string, answer: string, expectedClaims: string[]): number {
  const questionScore = lexicalCosineSimilarity(question, answer);
  const claimScore = expectedClaims.length
    ? expectedClaims.reduce(
        (sum, claim) => sum + lexicalCosineSimilarity(claim, answer),
        0,
      ) / expectedClaims.length
    : questionScore;
  return clamp(0.4 * questionScore + 0.6 * claimScore);
}

function answerClaims(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((claim) => claim.replace(/\[S\d+\]/g, "").trim())
    .filter((claim) => claim.length >= 12);
}

export function faithfulness(answer: string, contexts: string[]): number {
  const claims = answerClaims(answer);
  if (claims.length === 0) return contexts.length === 0 ? 1 : 0;
  if (contexts.length === 0) return 0;
  const supported = claims.filter((claim) => {
    const best = Math.max(...contexts.map((context) => lexicalCosineSimilarity(claim, context)));
    const numericTokens = claim.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
    const numbersSupported = numericTokens.every((token) => contexts.some((context) => context.includes(token)));
    return best >= 0.22 && numbersSupported;
  }).length;
  return supported / claims.length;
}

export function citationCorrectness(answer: string, citations: Citation[]): number {
  const labels = [...answer.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
  if (labels.length === 0) return citations.length === 0 ? 1 : 0;
  const validReferences = labels.filter((label) => label > 0 && label <= citations.length).length / labels.length;
  const metadataCompleteness = citations.length
    ? citations.filter(
        (citation) =>
          citation.documentTitle.length > 0 &&
          citation.version.length > 0 &&
          citation.evidenceSnippet.length > 0,
      ).length / citations.length
    : 0;
  return clamp(0.7 * validReferences + 0.3 * metadataCompleteness);
}

export function calculateEvaluationMetrics(
  question: EvaluationQuestion,
  output: EvaluationRunOutput,
): EvaluationMetrics {
  const retrievedIds = output.retrievedEvidence
    .map((evidence) => evidence.relevanceId ?? evidence.id)
    .filter(Boolean);
  const contexts = output.retrievedEvidence.map((evidence) => evidence.content);
  const faithful = faithfulness(output.answer, contexts);
  return {
    retrievalPrecision: retrievalPrecision(retrievedIds, question.relevantEvidenceIds),
    retrievalRecall: retrievalRecall(retrievedIds, question.relevantEvidenceIds),
    contextRelevance: contextRelevance(question.question, contexts),
    answerRelevance: answerRelevance(question.question, output.answer, question.expectedClaims),
    faithfulness: faithful,
    citationCorrectness: citationCorrectness(output.answer, output.citations),
    changeDetectionAccuracy: setF1(output.detectedChangeTypes, question.expectedChangeTypes),
    conflictDetectionAccuracy: setF1(output.detectedConflictLabels, question.expectedConflictLabels),
    unsupportedClaimRate: clamp(1 - faithful),
    latencyMs: output.latencyMs,
    inputTokens: output.inputTokens,
    outputTokens: output.outputTokens,
    totalTokens: output.totalTokens,
    estimatedCostUsd: output.estimatedCostUsd,
  };
}

export function averageMetrics(metrics: EvaluationMetrics[]): EvaluationMetrics {
  const empty: EvaluationMetrics = {
    retrievalPrecision: 0,
    retrievalRecall: 0,
    contextRelevance: 0,
    answerRelevance: 0,
    faithfulness: 0,
    citationCorrectness: 0,
    changeDetectionAccuracy: 0,
    conflictDetectionAccuracy: 0,
    unsupportedClaimRate: 0,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
  if (metrics.length === 0) return empty;
  for (const metric of metrics) {
    for (const key of Object.keys(empty) as Array<keyof EvaluationMetrics>) {
      empty[key] += metric[key] / metrics.length;
    }
  }
  empty.inputTokens = Math.round(empty.inputTokens);
  empty.outputTokens = Math.round(empty.outputTokens);
  empty.totalTokens = Math.round(empty.totalTokens);
  return empty;
}
