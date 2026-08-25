import type { SupabaseClient } from "@supabase/supabase-js";

import type { HybridSearchProvider, HybridSearchRequest, RetrievedChunk } from "./types";

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function rowToChunk(raw: unknown, query: string): RetrievedChunk {
  if (!raw || typeof raw !== "object") throw new Error("Hybrid search returned an invalid row");
  const row = raw as Record<string, unknown>;
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const id = String(row.chunk_id ?? row.id ?? "");
  const documentId = String(row.document_id ?? metadata.documentId ?? "");
  const content = String(row.content ?? "");
  if (!id || !documentId || !content) throw new Error("Hybrid search row is missing chunk identity or content");
  return {
    id,
    content,
    metadata: {
      ...metadata,
      organizationId: String(row.organization_id ?? metadata.organizationId ?? ""),
      documentId,
      documentTitle: String(row.document_title ?? metadata.documentTitle ?? "Untitled policy"),
      version: String(row.document_version ?? row.version ?? metadata.version ?? "Unknown"),
      departmentId: nullableString(row.department_id ?? metadata.departmentId),
      category: nullableString(row.category ?? metadata.category),
      effectiveDate: nullableString(row.effective_date ?? metadata.effectiveDate),
      storagePath: nullableString(row.storage_path ?? metadata.storagePath),
      pageNumber:
        row.page_number === null || row.page_number === undefined
          ? null
          : numberValue(row.page_number),
      sectionHeading: nullableString(row.section_heading ?? metadata.sectionHeading),
      chunkIndex: numberValue(row.chunk_index ?? metadata.chunkIndex),
    },
    vectorScore: numberValue(row.semantic_score ?? row.vector_score ?? row.similarity),
    fullTextScore: numberValue(row.full_text_score ?? row.fts_score ?? row.text_rank),
    fusedScore: numberValue(row.combined_score ?? row.fused_score),
    rerankScore: null,
    score: numberValue(row.combined_score ?? row.fused_score),
    matchedQueries: [query],
  };
}

export class SupabaseHybridSearchProvider implements HybridSearchProvider {
  constructor(private readonly supabase: SupabaseClient) {}

  async searchChannels(request: HybridSearchRequest) {
    const { data, error } = await this.supabase.rpc("hybrid_search_document_chunks", {
      query_text: request.query,
      query_embedding: request.queryEmbedding,
      match_count: request.limit,
      semantic_weight: 0.65,
      full_text_weight: 0.35,
      rrf_k: 60,
      filter_organization_id: request.filters.organizationId,
      filter_document_ids: request.filters.documentIds.length ? request.filters.documentIds : null,
      filter_department_ids: request.filters.departmentIds.length ? request.filters.departmentIds : null,
      filter_versions: request.filters.versions.length ? request.filters.versions : null,
      min_similarity: request.minSimilarity,
    });
    if (error) throw new Error(`Hybrid policy search failed: ${error.message}`);
    const chunks: RetrievedChunk[] = ((data ?? []) as unknown[]).map((row) =>
      rowToChunk(row, request.query),
    );
    const excludedDocumentIds = new Set(request.filters.excludedDocumentIds ?? []);
    const scopeFiltered = chunks.filter(
      (chunk) =>
        chunk.metadata.organizationId === request.filters.organizationId &&
        !excludedDocumentIds.has(chunk.metadata.documentId),
    );
    const categoryFiltered = request.filters.category
      ? scopeFiltered.filter((chunk) => chunk.metadata.category === request.filters.category)
      : scopeFiltered;
    return {
      vector: categoryFiltered
        .filter((chunk) => chunk.vectorScore > 0)
        .sort((a, b) => b.vectorScore - a.vectorScore),
      fullText: categoryFiltered
        .filter((chunk) => chunk.fullTextScore > 0)
        .sort((a, b) => b.fullTextScore - a.fullTextScore),
    };
  }
}
