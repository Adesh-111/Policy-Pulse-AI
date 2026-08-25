import { z } from "zod";

import type { Citation } from "@/lib/ai";

export const RetrievalFiltersSchema = z.object({
  organizationId: z.string().min(1),
  documentIds: z.array(z.string()).max(100),
  excludedDocumentIds: z.array(z.string()).max(100).optional(),
  departmentIds: z.array(z.string()).max(100),
  versions: z.array(z.string()).max(50),
  category: z.string().nullable(),
});

export interface RetrievedChunkMetadata {
  organizationId: string;
  documentId: string;
  documentTitle: string;
  version: string;
  departmentId: string | null;
  category: string | null;
  effectiveDate: string | null;
  storagePath: string | null;
  pageNumber: number | null;
  sectionHeading: string | null;
  chunkIndex: number;
  [key: string]: unknown;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  metadata: RetrievedChunkMetadata;
  vector?: number[];
  vectorScore: number;
  fullTextScore: number;
  fusedScore: number;
  rerankScore: number | null;
  score: number;
  matchedQueries: string[];
}

export interface SearchChannels {
  vector: RetrievedChunk[];
  fullText: RetrievedChunk[];
}

export interface HybridSearchRequest {
  query: string;
  queryEmbedding: number[];
  limit: number;
  filters: z.infer<typeof RetrievalFiltersSchema>;
  minSimilarity: number;
}

export interface HybridSearchProvider {
  searchChannels(request: HybridSearchRequest): Promise<SearchChannels>;
}

export interface HybridRetrievalOptions {
  limit?: number;
  candidateLimit?: number;
  minSimilarity?: number;
  minimumEvidence?: number;
  minimumEvidenceScore?: number;
  rrfK?: number;
  vectorWeight?: number;
  fullTextWeight?: number;
  mmrLambda?: number;
  rewriteQuery?: boolean;
  rerank?: boolean;
}

export interface HybridRetrievalResult {
  originalQuery: string;
  rewrittenQueries: string[];
  chunks: RetrievedChunk[];
  citations: Citation[];
  sufficientEvidence: boolean;
  insufficiencyReason: string | null;
}

export type RetrievalFilters = z.infer<typeof RetrievalFiltersSchema>;

export const INSUFFICIENT_EVIDENCE_MESSAGE =
  "I could not find sufficient evidence in the uploaded policies.";
