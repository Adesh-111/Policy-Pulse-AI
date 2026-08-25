import { getEncoding } from "js-tiktoken";

import type {
  DetectedSection,
  DocumentChunk,
  DocumentMetadata,
  ExtractedDocument,
} from "./types";

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

const MARKDOWN_HEADING = /^#{1,6}\s+(.{1,180})$/;
const NUMBERED_HEADING = /^(?:section\s+)?\d+(?:\.\d+){0,5}[.):]?\s+(.{2,160})$/i;
const LABEL_HEADING = /^(?:article|chapter|part|appendix|schedule)\s+[\w.-]+(?:\s*[-:\u2013]\s*.+)?$/i;

function headingFromLine(line: string): string | null {
  const value = line.trim();
  if (!value || value.length > 180) return null;
  const markdown = MARKDOWN_HEADING.exec(value);
  if (markdown?.[1]) return markdown[1].trim();
  if (NUMBERED_HEADING.test(value) || LABEL_HEADING.test(value)) return value;
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && value === value.toUpperCase() && !/[.!?;]$/.test(value)) return value;
  return null;
}

export function detectSections(document: ExtractedDocument): DetectedSection[] {
  const sections: DetectedSection[] = [];
  for (const page of document.pages) {
    let heading: string | null = null;
    let lines: string[] = [];
    const flush = () => {
      const text = lines.join("\n").trim();
      if (text) sections.push({ heading, pageNumber: page.pageNumber, text });
      lines = [];
    };
    for (const line of page.text.split("\n")) {
      const detected = headingFromLine(line);
      if (detected) {
        flush();
        heading = detected;
      }
      lines.push(line);
    }
    flush();
  }
  return sections.length
    ? sections
    : document.pages.map((page) => ({ heading: null, pageNumber: page.pageNumber, text: page.text }));
}

export function chunkDocument(
  document: ExtractedDocument,
  rawMetadata: DocumentMetadata,
  options: ChunkingOptions = {},
): DocumentChunk[] {
  const chunkSize = options.chunkSize ?? 800;
  const overlap = options.overlap ?? 120;
  if (!Number.isInteger(chunkSize) || chunkSize < 100) {
    throw new RangeError("chunkSize must be an integer of at least 100 tokens");
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= chunkSize) {
    throw new RangeError("overlap must be a non-negative integer smaller than chunkSize");
  }

  const encoder = getEncoding("cl100k_base");
  const chunks: DocumentChunk[] = [];
  const stride = chunkSize - overlap;
  for (const section of detectSections(document)) {
    const tokens = encoder.encode(section.text);
    for (let start = 0; start < tokens.length; start += stride) {
      const tokenSlice = tokens.slice(start, start + chunkSize);
      const content = encoder.decode(tokenSlice).trim();
      if (!content) continue;
      const chunkIndex = chunks.length;
      chunks.push({
        organizationId: rawMetadata.organizationId,
        documentId: rawMetadata.documentId,
        documentTitle: rawMetadata.title,
        documentVersion: rawMetadata.version,
        category: rawMetadata.category,
        departmentId: rawMetadata.departmentId,
        effectiveDate: rawMetadata.effectiveDate,
        storagePath: rawMetadata.storagePath,
        pageNumber: section.pageNumber,
        sectionHeading: section.heading,
        chunkIndex,
        content,
        tokenCount: tokenSlice.length,
        metadata: {
          designation: rawMetadata.designation,
          sourceFileName: document.fileName,
          sourceFileHash: document.fileHash,
          sectionTokenOffset: start,
          extractionKind: document.kind,
        },
      });
      if (start + chunkSize >= tokens.length) break;
    }
  }
  return chunks;
}
