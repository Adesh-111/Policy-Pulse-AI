import type { Citation } from "@/lib/ai";

import type { RetrievedChunk } from "./types";

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function evidenceSnippet(content: string, query = "", maximumLength = 420): string {
  const compact = compactWhitespace(content);
  if (compact.length <= maximumLength) return compact;
  const terms = query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 3);
  const lower = compact.toLocaleLowerCase();
  const hit = terms.map((term) => lower.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, hit - Math.floor(maximumLength / 3));
  const prefix = start > 0 ? "\u2026" : "";
  const suffix = start + maximumLength < compact.length ? "\u2026" : "";
  return `${prefix}${compact.slice(start, start + maximumLength).trim()}${suffix}`;
}

export function chunkToCitation(chunk: RetrievedChunk, query = ""): Citation {
  return {
    chunkId: chunk.id,
    documentId: chunk.metadata.documentId,
    documentTitle: chunk.metadata.documentTitle,
    version: chunk.metadata.version,
    pageNumber: chunk.metadata.pageNumber,
    sectionHeading: chunk.metadata.sectionHeading,
    evidenceSnippet: evidenceSnippet(chunk.content, query),
  };
}

export function formatEvidenceForPrompt(chunks: RetrievedChunk[], query = ""): string {
  return chunks
    .map((chunk, index) => {
      const source = `S${index + 1}`;
      const page = chunk.metadata.pageNumber === null ? "page unavailable" : `page ${chunk.metadata.pageNumber}`;
      const section = chunk.metadata.sectionHeading ?? "section unavailable";
      return `[${source}] ${chunk.metadata.documentTitle} | version ${chunk.metadata.version} | ${page} | ${section}\n${evidenceSnippet(chunk.content, query, 1_200)}`;
    })
    .join("\n\n");
}
