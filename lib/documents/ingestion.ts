import type { OpenAIService } from "@/lib/openai";

import { chunkDocument, type ChunkingOptions } from "./chunk";
import { extractDocument } from "./extract";
import {
  DocumentMetadataSchema,
  type DocumentChunk,
  type DocumentFileInput,
  type DocumentMetadata,
  type DocumentProcessingStatus,
} from "./types";

export interface IndexedDocumentChunk extends DocumentChunk {
  embedding: number[];
}

export interface DocumentChunkRepository {
  findDuplicate(organizationId: string, fileHash: string): Promise<{ documentId: string } | null>;
  replaceDocumentChunks(documentId: string, chunks: IndexedDocumentChunk[]): Promise<void>;
  updateDocumentProcessing(
    documentId: string,
    status: DocumentProcessingStatus,
    details?: { error?: string; chunkCount?: number; fileHash?: string },
  ): Promise<void>;
}

export interface IngestionServices {
  openAI: OpenAIService;
  repository: DocumentChunkRepository;
  onStatus?: (status: DocumentProcessingStatus) => Promise<void> | void;
}

export interface IngestionResult {
  documentId: string;
  fileHash: string;
  chunkCount: number;
  warningMessages: string[];
}

async function setStatus(
  services: IngestionServices,
  metadata: DocumentMetadata,
  status: DocumentProcessingStatus,
  details?: { error?: string; chunkCount?: number; fileHash?: string },
): Promise<void> {
  await services.repository.updateDocumentProcessing(metadata.documentId, status, details);
  await services.onStatus?.(status);
}

export async function ingestDocument(
  file: DocumentFileInput,
  rawMetadata: unknown,
  services: IngestionServices,
  options: ChunkingOptions & { maxBytes?: number } = {},
): Promise<IngestionResult> {
  const metadata = DocumentMetadataSchema.parse(rawMetadata);
  try {
    await setStatus(services, metadata, "extracting");
    const document = await extractDocument(file, { maxBytes: options.maxBytes });
    const duplicate = await services.repository.findDuplicate(metadata.organizationId, document.fileHash);
    if (duplicate && duplicate.documentId !== metadata.documentId) {
      throw new Error(`This file is already indexed as document ${duplicate.documentId}`);
    }

    await setStatus(services, metadata, "chunking", { fileHash: document.fileHash });
    const chunks = chunkDocument(document, metadata, options);
    if (chunks.length === 0) throw new Error("Chunking produced no indexable policy text");

    await setStatus(services, metadata, "embedding", { fileHash: document.fileHash, chunkCount: chunks.length });
    const embeddings = await services.openAI.embed({
      operation: "document.embedding",
      organizationId: metadata.organizationId,
      inputs: chunks.map((chunk) => chunk.content),
      dimensions: 1536,
      metadata: { organizationId: metadata.organizationId, documentId: metadata.documentId },
    });
    if (embeddings.length !== chunks.length || embeddings.some((embedding) => embedding.length !== 1536)) {
      throw new Error("Embedding service returned an unexpected vector count or dimension");
    }
    await services.repository.replaceDocumentChunks(
      metadata.documentId,
      chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] as number[] })),
    );
    await setStatus(services, metadata, "indexed", { fileHash: document.fileHash, chunkCount: chunks.length });
    return {
      documentId: metadata.documentId,
      fileHash: document.fileHash,
      chunkCount: chunks.length,
      warningMessages: document.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown document ingestion failure";
    await setStatus(services, metadata, "failed", { error: message });
    throw error;
  }
}
