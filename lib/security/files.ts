import { z } from "zod";
import { ApiError } from "@/lib/security/errors";

export const MAX_POLICY_FILE_BYTES = 20 * 1024 * 1024;

export const allowedPolicyTypes = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "text/plain": ["txt"],
  "text/markdown": ["md", "markdown"],
} as const;

export const documentMetadataSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2_000).default(""),
    category: z.string().trim().min(2).max(80),
    version: z.string().trim().min(1).max(40),
    effectiveDate: z.iso.date(),
    departmentIds: z.array(z.uuid()).max(20).default([]),
    departmentName: z.string().trim().min(2).max(120).optional(),
    designation: z.enum(["old", "new"]),
    fileName: z.string().trim().min(1).max(240),
    mimeType: z.enum(Object.keys(allowedPolicyTypes) as [
      keyof typeof allowedPolicyTypes,
      ...(keyof typeof allowedPolicyTypes)[],
    ]),
    fileSize: z.number().int().positive().max(MAX_POLICY_FILE_BYTES),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .refine(
    (metadata) => metadata.departmentIds.length > 0 || Boolean(metadata.departmentName),
    {
      message: "Enter a department name.",
      path: ["departmentName"],
    },
  );

export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;

export function sanitizeFileName(fileName: string): string {
  const normalized = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 180) || "policy-document";
}

export function validateFileMetadata(input: DocumentMetadataInput) {
  const extension = input.fileName.split(".").pop()?.toLowerCase();
  const allowedExtensions = allowedPolicyTypes[input.mimeType];
  if (!extension || !(allowedExtensions as readonly string[]).includes(extension)) {
    throw new ApiError(
      "The file extension does not match its declared type.",
      400,
      "FILE_TYPE_MISMATCH",
    );
  }
  if (input.fileSize === 0) {
    throw new ApiError("The uploaded file is empty.", 400, "EMPTY_FILE");
  }
  return {
    ...input,
    fileName: sanitizeFileName(input.fileName),
  };
}

export function hasValidMagicBytes(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  }
  return !bytes.includes(0);
}
