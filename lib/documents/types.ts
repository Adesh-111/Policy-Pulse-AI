import { z } from "zod";

export const SupportedDocumentKindSchema = z.enum(["pdf", "docx", "txt", "md"]);

export const DocumentMetadataSchema = z.object({
  organizationId: z.string().min(1),
  documentId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2_000),
  category: z.string().trim().min(1).max(100),
  version: z.string().trim().min(1).max(100),
  effectiveDate: z.iso.date(),
  departmentId: z.string().min(1).nullable(),
  designation: z.enum(["old", "new", "reference"]),
  storagePath: z.string().min(1),
});

export interface DocumentFileInput {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export interface ExtractedDocument {
  kind: z.infer<typeof SupportedDocumentKindSchema>;
  fileName: string;
  fileHash: string;
  text: string;
  pages: ExtractedPage[];
  warnings: string[];
}

export interface DetectedSection {
  heading: string | null;
  pageNumber: number | null;
  text: string;
}

export interface DocumentChunk {
  organizationId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  category: string;
  departmentId: string | null;
  effectiveDate: string;
  storagePath: string;
  pageNumber: number | null;
  sectionHeading: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, string | number | boolean | null>;
}

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type SupportedDocumentKind = z.infer<typeof SupportedDocumentKindSchema>;

export type DocumentProcessingStatus =
  | "extracting"
  | "chunking"
  | "embedding"
  | "indexed"
  | "failed";
