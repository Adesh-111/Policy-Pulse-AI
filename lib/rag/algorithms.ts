import type { RetrievedChunk } from "./types";

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function canonicalText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function contentFingerprint(value: string): string {
  const normalized = canonicalText(value);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mergeChunk(existing: RetrievedChunk, incoming: RetrievedChunk): RetrievedChunk {
  return {
    ...existing,
    vectorScore: Math.max(existing.vectorScore, incoming.vectorScore),
    fullTextScore: Math.max(existing.fullTextScore, incoming.fullTextScore),
    fusedScore: Math.max(existing.fusedScore, incoming.fusedScore),
    rerankScore:
      existing.rerankScore === null
        ? incoming.rerankScore
        : incoming.rerankScore === null
          ? existing.rerankScore
          : Math.max(existing.rerankScore, incoming.rerankScore),
    score: Math.max(existing.score, incoming.score),
    matchedQueries: [...new Set([...existing.matchedQueries, ...incoming.matchedQueries])],
    vector: existing.vector ?? incoming.vector,
  };
}

export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const byIdentity = new Map<string, RetrievedChunk>();
  const fingerprintToIdentity = new Map<string, string>();
  for (const chunk of chunks) {
    const exactIdentity = `${chunk.metadata.documentId}:${chunk.id}`;
    const fingerprint = `${chunk.metadata.documentId}:${contentFingerprint(chunk.content)}`;
    const identity = fingerprintToIdentity.get(fingerprint) ?? exactIdentity;
    const existing = byIdentity.get(identity);
    byIdentity.set(identity, existing ? mergeChunk(existing, chunk) : { ...chunk });
    fingerprintToIdentity.set(fingerprint, identity);
  }
  return [...byIdentity.values()];
}

export function reciprocalRankFusion(
  rankedLists: RetrievedChunk[][],
  options: { k?: number; weights?: number[] } = {},
): RetrievedChunk[] {
  const k = options.k ?? 60;
  const weights = options.weights ?? rankedLists.map(() => 1);
  if (k <= 0) throw new RangeError("RRF k must be positive");
  const accumulated = new Map<string, RetrievedChunk>();

  rankedLists.forEach((list, listIndex) => {
    const weight = weights[listIndex] ?? 1;
    deduplicateChunks(list).forEach((chunk, rank) => {
      const key = `${chunk.metadata.documentId}:${chunk.id}`;
      const contribution = weight / (k + rank + 1);
      const existing = accumulated.get(key);
      if (existing) {
        accumulated.set(key, {
          ...mergeChunk(existing, chunk),
          fusedScore: existing.fusedScore + contribution,
        });
      } else {
        accumulated.set(key, { ...chunk, fusedScore: contribution });
      }
    });
  });

  const results = deduplicateChunks([...accumulated.values()]).sort((a, b) => b.fusedScore - a.fusedScore);
  const maximum = results[0]?.fusedScore ?? 1;
  return results.map((chunk) => ({
    ...chunk,
    score: clampScore(maximum > 0 ? chunk.fusedScore / maximum : 0),
  }));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return clampScore((dot / Math.sqrt(leftNorm * rightNorm) + 1) / 2);
}

function termSet(text: string): Set<string> {
  return new Set(canonicalText(text).split(" ").filter((term) => term.length > 2));
}

export function lexicalJaccard(left: string, right: string): number {
  const leftTerms = termSet(left);
  const rightTerms = termSet(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return 0;
  let intersection = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) intersection += 1;
  return intersection / (leftTerms.size + rightTerms.size - intersection);
}

function candidateSimilarity(left: RetrievedChunk, right: RetrievedChunk): number {
  if (left.vector && right.vector) return cosineSimilarity(left.vector, right.vector);
  return lexicalJaccard(left.content, right.content);
}

function relevance(query: string, queryVector: number[], chunk: RetrievedChunk): number {
  const vectorRelevance = chunk.vector ? cosineSimilarity(queryVector, chunk.vector) : chunk.vectorScore;
  const channelRelevance = Math.max(vectorRelevance, chunk.fullTextScore, chunk.rerankScore ?? 0);
  return clampScore(0.75 * channelRelevance + 0.25 * lexicalJaccard(query, chunk.content));
}

export function maximalMarginalRelevance(
  query: string,
  queryVector: number[],
  candidates: RetrievedChunk[],
  limit: number,
  lambda = 0.72,
): RetrievedChunk[] {
  if (limit <= 0 || candidates.length === 0) return [];
  if (lambda < 0 || lambda > 1) throw new RangeError("MMR lambda must be between zero and one");
  const remaining = [...deduplicateChunks(candidates)];
  const selected: RetrievedChunk[] = [];
  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestMMR = Number.NEGATIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const candidateRelevance = relevance(query, queryVector, candidate);
      const redundancy = selected.length
        ? Math.max(...selected.map((chosen) => candidateSimilarity(candidate, chosen)))
        : 0;
      const mmr = lambda * candidateRelevance - (1 - lambda) * redundancy;
      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestIndex = index;
      }
    });
    const [chosen] = remaining.splice(bestIndex, 1);
    if (chosen) selected.push({ ...chosen, score: clampScore(relevance(query, queryVector, chosen)) });
  }
  return selected;
}

export function applyRerankScores(
  candidates: RetrievedChunk[],
  scores: Array<{ chunkId: string; score: number }>,
): RetrievedChunk[] {
  const byId = new Map(scores.map((item) => [item.chunkId, clampScore(item.score)]));
  return candidates
    .map((candidate) => {
      const rerankScore = byId.get(candidate.id) ?? null;
      return {
        ...candidate,
        rerankScore,
        score: rerankScore === null ? candidate.score : clampScore(0.8 * rerankScore + 0.2 * candidate.score),
      };
    })
    .sort((a, b) => b.score - a.score);
}
