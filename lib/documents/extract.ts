import { createHash } from "node:crypto";
import path from "node:path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import type {
  DocumentFileInput,
  ExtractedDocument,
  ExtractedPage,
  SupportedDocumentKind,
} from "./types";

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

const MIME_KIND: Record<string, SupportedDocumentKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
};

const EXTENSION_KIND: Record<string, SupportedDocumentKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "md",
  ".markdown": "md",
};

export class DocumentExtractionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY_FILE"
      | "FILE_TOO_LARGE"
      | "UNSUPPORTED_TYPE"
      | "TYPE_MISMATCH"
      | "CORRUPT_FILE"
      | "EMPTY_TEXT",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DocumentExtractionError";
  }
}

export function cleanExtractedText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/([\p{L}\p{N}])-\n(?=[\p{Ll}\p{N}])/gu, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function startsWithBytes(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function resolveKind(file: DocumentFileInput): SupportedDocumentKind {
  const extension = path.extname(file.fileName).toLowerCase();
  const byExtension = EXTENSION_KIND[extension];
  const normalizedMime = file.mimeType.toLowerCase().split(";", 1)[0]?.trim();
  const byMime = MIME_KIND[normalizedMime];
  if (!byExtension || !byMime) {
    throw new DocumentExtractionError("Only PDF, DOCX, TXT, and Markdown files are supported", "UNSUPPORTED_TYPE");
  }
  if (byExtension !== byMime && !(byMime === "txt" && byExtension === "md")) {
    throw new DocumentExtractionError("The file extension does not match its MIME type", "TYPE_MISMATCH");
  }
  return byExtension;
}

function validateSignature(kind: SupportedDocumentKind, bytes: Uint8Array): void {
  if (kind === "pdf" && !startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new DocumentExtractionError("The PDF signature is invalid", "CORRUPT_FILE");
  }
  if (kind === "docx" && !startsWithBytes(bytes, [0x50, 0x4b])) {
    throw new DocumentExtractionError("The DOCX container signature is invalid", "CORRUPT_FILE");
  }
  if ((kind === "txt" || kind === "md") && bytes.includes(0)) {
    throw new DocumentExtractionError("The text document contains binary data", "CORRUPT_FILE");
  }
}

async function extractPdf(bytes: Uint8Array): Promise<{ pages: ExtractedPage[]; warnings: string[] }> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return {
      pages: result.pages.map((page) => ({ pageNumber: page.num, text: cleanExtractedText(page.text) })),
      warnings: [],
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Uint8Array): Promise<{ pages: ExtractedPage[]; warnings: string[] }> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return {
    pages: [{ pageNumber: null, text: cleanExtractedText(result.value) }],
    warnings: result.messages.map((message) => message.message),
  };
}

function extractPlainText(bytes: Uint8Array): { pages: ExtractedPage[]; warnings: string[] } {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return {
    pages: [{ pageNumber: null, text: cleanExtractedText(decoder.decode(bytes)) }],
    warnings: [],
  };
}

export async function extractDocument(
  input: DocumentFileInput,
  options: { maxBytes?: number } = {},
): Promise<ExtractedDocument> {
  if (input.bytes.byteLength === 0) {
    throw new DocumentExtractionError("The uploaded document is empty", "EMPTY_FILE");
  }
  if (input.bytes.byteLength > (options.maxBytes ?? DEFAULT_MAX_BYTES)) {
    throw new DocumentExtractionError("The uploaded document exceeds the size limit", "FILE_TOO_LARGE");
  }
  const kind = resolveKind(input);
  validateSignature(kind, input.bytes);

  try {
    const extracted =
      kind === "pdf"
        ? await extractPdf(input.bytes)
        : kind === "docx"
          ? await extractDocx(input.bytes)
          : extractPlainText(input.bytes);
    const pages = extracted.pages.filter((page) => page.text.length > 0);
    const text = pages.map((page) => page.text).join("\n\n").trim();
    if (!text) {
      throw new DocumentExtractionError("No readable text was found in the document", "EMPTY_TEXT");
    }
    return {
      kind,
      fileName: input.fileName,
      fileHash: createHash("sha256").update(input.bytes).digest("hex"),
      text,
      pages,
      warnings: extracted.warnings,
    };
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError("The document could not be parsed", "CORRUPT_FILE", { cause: error });
  }
}
