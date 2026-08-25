export type ApiRecord = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const nested = isRecord(record.error) ? record.error : {};
    const message = stringValue(nested.message) || stringValue(record.message) || stringValue(record.error) || `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return (isRecord(payload) && "data" in payload ? payload.data : payload) as T;
}

export function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function boolValue(value: unknown) {
  return value === true || value === "true";
}

export function arrayValue<T = ApiRecord>(payload: unknown, keys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!isRecord(payload)) return [];
  for (const key of [...keys, "items", "records", "results", "data"]) {
    if (Array.isArray(payload[key])) return payload[key] as T[];
  }
  return [];
}

export function recordValue(payload: unknown, keys: string[] = []): ApiRecord {
  if (!isRecord(payload)) return {};
  for (const key of keys) if (isRecord(payload[key])) return payload[key] as ApiRecord;
  return payload;
}

export function firstString(record: ApiRecord, keys: string[], fallback = "—") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

export function formatDate(value: unknown, includeTime = false) {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

export function idOf(record: ApiRecord) {
  return firstString(record, ["id", "document_id", "comparison_id", "request_id", "run_id"], "");
}

function relatedRecords(value: unknown): ApiRecord[] {
  if (isRecord(value)) return [value];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function departmentName(record: ApiRecord, fallback = "Organization-wide") {
  const flat = firstString(record, ["departmentName", "department_name", "department"], "");
  if (flat) return flat;
  const names = new Set<string>();
  for (const relation of [record.departments, record.department]) {
    for (const department of relatedRecords(relation)) {
      const name = firstString(department, ["name", "title", "code"], "");
      if (name) names.add(name);
    }
  }
  for (const link of relatedRecords(record.document_departments ?? record.documentDepartments)) {
    for (const department of relatedRecords(link.departments ?? link.department)) {
      const name = firstString(department, ["name", "title", "code"], "");
      if (name) names.add(name);
    }
  }
  return names.size ? [...names].join(", ") : fallback;
}

export function relatedDocumentTitle(
  record: ApiRecord,
  side: "old" | "new",
  fallback = "Policy version",
) {
  const prefix = side === "old" ? "old" : "new";
  const flat = firstString(
    record,
    [`${prefix}DocumentTitle`, `${prefix}_document_title`, `${prefix}_title`],
    "",
  );
  if (flat) return flat;
  const relation = record[`${prefix}Document`] ?? record[`${prefix}_document`];
  const document = relatedRecords(relation)[0];
  return document ? firstString(document, ["title", "name"], fallback) : fallback;
}

export interface CitationDisplay {
  documentTitle: string;
  version: string;
  pageNumber: string;
  sectionHeading: string;
  evidenceSnippet: string;
}

/** Normalize persisted snake_case citations and agent-produced camelCase citations. */
export function citationDisplay(value: unknown): CitationDisplay | null {
  if (!isRecord(value)) return null;
  return {
    documentTitle: firstString(value, ["documentTitle", "document_title", "title"], "Policy source"),
    version: firstString(value, ["version", "documentVersion", "document_version"], "—"),
    pageNumber: firstString(value, ["pageNumber", "page_number", "page"], ""),
    sectionHeading: firstString(value, ["sectionHeading", "section_heading", "section"], "Section unavailable"),
    evidenceSnippet: firstString(
      value,
      ["evidenceSnippet", "evidence_snippet", "snippet", "text", "content"],
      "Evidence excerpt unavailable.",
    ),
  };
}

/** Collect array citations plus the paired citation fields used by changes/conflicts. */
export function citationRecords(value: unknown): ApiRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  const records = [
    ...arrayValue<ApiRecord>(value.citations),
    ...arrayValue<ApiRecord>(value.sources),
    ...arrayValue<ApiRecord>(value.evidence),
    value.oldCitation,
    value.old_citation,
    value.newCitation,
    value.new_citation,
    value.leftCitation,
    value.left_citation,
    value.rightCitation,
    value.right_citation,
  ].filter(isRecord);
  const seen = new Set<string>();
  return records.filter((record) => {
    const display = citationDisplay(record);
    const key = firstString(record, ["chunkId", "chunk_id", "id"], "") ||
      `${display?.documentTitle}|${display?.version}|${display?.pageNumber}|${display?.evidenceSnippet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
