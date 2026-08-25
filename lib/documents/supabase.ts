import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DocumentChunkRepository,
  IndexedDocumentChunk,
} from "./ingestion";
import type { DocumentChunk, DocumentProcessingStatus } from "./types";

export class SupabaseDocumentChunkRepository implements DocumentChunkRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly organizationId: string,
  ) {
    if (!organizationId)
      throw new Error("An organization ID is required for document indexing");
  }

  async findDuplicate(
    organizationId: string,
    fileHash: string,
  ): Promise<{ documentId: string } | null> {
    if (organizationId !== this.organizationId)
      throw new Error("Cross-organization document access is forbidden");
    const { data, error } = await this.supabase
      .from("documents")
      .select("id")
      .eq("organization_id", this.organizationId)
      .eq("content_sha256", fileHash)
      .maybeSingle();
    if (error)
      throw new Error(`Unable to check duplicate documents: ${error.message}`);
    return data
      ? { documentId: String((data as unknown as { id: unknown }).id) }
      : null;
  }

  async replaceDocumentChunks(
    documentId: string,
    chunks: IndexedDocumentChunk[],
  ): Promise<void> {
    if (
      chunks.some(
        (chunk) =>
          chunk.organizationId !== this.organizationId ||
          chunk.documentId !== documentId,
      )
    ) {
      throw new Error(
        "A chunk does not belong to the repository organization or document",
      );
    }
    for (let index = 0; index < chunks.length; index += 200) {
      const batch = chunks.slice(index, index + 200).map((chunk) => ({
        organization_id: chunk.organizationId,
        document_id: chunk.documentId,
        department_id: chunk.departmentId,
        document_version: chunk.documentVersion,
        category: chunk.category,
        effective_date: chunk.effectiveDate,
        storage_path: chunk.storagePath,
        page_number: chunk.pageNumber,
        section_heading: chunk.sectionHeading,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: chunk.tokenCount,
        metadata: chunk.metadata,
        embedding: chunk.embedding,
      }));
      const { error } = await this.supabase
        .from("document_chunks")
        .upsert(batch, { onConflict: "document_id,chunk_index" });
      if (error)
        throw new Error(`Unable to persist document chunks: ${error.message}`);
    }
    const { error: cleanupError } = await this.supabase
      .from("document_chunks")
      .delete()
      .eq("organization_id", this.organizationId)
      .eq("document_id", documentId)
      .gte("chunk_index", chunks.length);
    if (cleanupError)
      throw new Error(
        `Unable to remove stale document chunks: ${cleanupError.message}`,
      );
  }

  async replaceStagedDocumentChunks(
    documentId: string,
    chunks: DocumentChunk[],
  ): Promise<void> {
    if (
      chunks.some(
        (chunk) =>
          chunk.organizationId !== this.organizationId ||
          chunk.documentId !== documentId,
      )
    ) {
      throw new Error(
        "A staged chunk does not belong to the repository organization or document",
      );
    }
    const { error: deleteError } = await this.supabase
      .from("document_chunks")
      .delete()
      .eq("organization_id", this.organizationId)
      .eq("document_id", documentId);
    if (deleteError) {
      throw new Error(
        `Unable to reset staged document chunks: ${deleteError.message}`,
      );
    }
    for (let index = 0; index < chunks.length; index += 200) {
      const batch = chunks.slice(index, index + 200).map((chunk) => ({
        organization_id: chunk.organizationId,
        document_id: chunk.documentId,
        department_id: chunk.departmentId,
        document_version: chunk.documentVersion,
        category: chunk.category,
        effective_date: chunk.effectiveDate,
        storage_path: chunk.storagePath,
        page_number: chunk.pageNumber,
        section_heading: chunk.sectionHeading,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: chunk.tokenCount,
        metadata: chunk.metadata,
        embedding: null,
      }));
      const { error } = await this.supabase
        .from("document_chunks")
        .insert(batch);
      if (error)
        throw new Error(`Unable to stage document chunks: ${error.message}`);
    }
  }

  async updateDocumentProcessing(
    documentId: string,
    status: DocumentProcessingStatus,
    details?: { error?: string; chunkCount?: number; fileHash?: string },
  ): Promise<void> {
    const update: Record<string, unknown> = {
      processing_status: status,
      processing_error:
        status === "failed"
          ? (details?.error ?? "Document processing failed")
          : null,
      content_sha256: details?.fileHash,
      indexed_at: status === "indexed" ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };
    if (details?.chunkCount !== undefined)
      update.metadata = { chunk_count: details.chunkCount };
    const { error } = await this.supabase
      .from("documents")
      .update(update)
      .eq("id", documentId)
      .eq("organization_id", this.organizationId);
    if (error)
      throw new Error(
        `Unable to update document processing state: ${error.message}`,
      );
  }
}
