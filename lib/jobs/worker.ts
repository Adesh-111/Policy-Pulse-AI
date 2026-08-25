import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { buildUntrustedInputPrompt, type Citation } from "@/lib/ai";
import { loadOrganizationRuntimeSettings } from "@/lib/config/organization-settings";
import {
  answerRelevance,
  citationCorrectness,
  contextRelevance,
  faithfulness,
  retrievalPrecision,
  retrievalRecall,
  setF1,
  EVALUATION_DATASET_VERSION,
  EVALUATION_METRIC_VERSION,
  EVALUATION_PROMPT_VERSION,
} from "@/lib/evaluation";
import {
  chunkDocument,
  extractDocument,
  SupabaseDocumentChunkRepository,
} from "@/lib/documents";
import { createSupabaseAIStack } from "@/lib/rag";
import {
  advancePolicyWorkflow,
  createInitialWorkflowState,
  createSupabasePolicyWorkflow,
  PolicyWorkflowStateSchema,
  type PolicyWorkflowState,
} from "@/lib/workflows";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { enqueueJob } from "./queue";
import {
  claimBackgroundJobs,
  completeBackgroundJob,
  failBackgroundJob,
  heartbeatBackgroundJob,
  type LeasedBackgroundJob,
} from "./pooler";

type BackgroundJob = LeasedBackgroundJob;

interface EvaluationQuestionRow {
  id: string;
  external_id: string;
  question: string;
  expected_answer: string;
  category: string;
  expected_sources: Array<{ file?: string; section?: string }>;
  expected_change_types: string[];
}

const EMBEDDING_BATCH_SIZE = 32;

const ReflectionSchema = z.object({
  passed: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  citationScore: z.number().min(0).max(1),
  faithfulnessScore: z.number().min(0).max(1),
  issues: z.array(z.string()),
  revisedAnswer: z.string(),
});

function safeJobError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown background job failure";
  return {
    type: error instanceof Error ? error.name : "BackgroundJobError",
    message: message
      .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
      .slice(0, 1_500),
    occurred_at: new Date().toISOString(),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSource(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\.(md|txt|pdf|docx)$/g, "")
    .replace(/\b(old|new|policy|version)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function expectedSourceIds(question: EvaluationQuestionRow) {
  return question.expected_sources.map(
    (source, index) =>
      `${source.file ?? `source-${index + 1}`}#${source.section ?? "unknown-section"}`,
  );
}

function relevanceIdForCitation(
  citation: Citation,
  question: EvaluationQuestionRow,
): string | null {
  const title = normalizeSource(citation.documentTitle);
  const matchIndex = question.expected_sources.findIndex((source) => {
    const file = normalizeSource(source.file ?? "");
    const titleMatch = Boolean(
      file && title && (file.includes(title) || title.includes(file)),
    );
    const section = normalizeSource(source.section ?? "");
    const citedSection = normalizeSource(citation.sectionHeading ?? "");
    const sectionMatch =
      !section ||
      !citedSection ||
      section.includes(citedSection) ||
      citedSection.includes(section);
    return titleMatch && sectionMatch;
  });
  return matchIndex < 0
    ? null
    : (expectedSourceIds(question)[matchIndex] ?? null);
}

function inferredFindingLabels(answer: string) {
  const normalized = answer.toLowerCase();
  const changeTypes: string[] = [];
  if (/deadline|within \d|days?|hours?/.test(normalized))
    changeTypes.push("deadline_change");
  if (
    /responsib|must (?:submit|appoint|operate|review)|department|office/.test(
      normalized,
    )
  ) {
    changeTypes.push("responsibility_change");
  }
  if (/eligible|eligibility|cgpa|attendance requirement/.test(normalized)) {
    changeTypes.push("eligibility_change");
  }
  if (/exception|unless|conditionally|only when/.test(normalized))
    changeTypes.push("exception_added");
  if (/retention|requirement|must|prohibit/.test(normalized))
    changeTypes.push("modified");
  const conflictLabels =
    /contradict|conflict|do not agree|inconsistent|\bno\b/.test(normalized)
      ? ["direct_contradiction"]
      : [];
  return { changeTypes: [...new Set(changeTypes)], conflictLabels };
}

async function processIngestion(job: BackgroundJob) {
  const admin = createAdminSupabaseClient();
  const { data: document, error } = await admin
    .from("documents")
    .select(
      "id,organization_id,title,description,category,version,designation,effective_date,department_id,storage_path,original_filename,mime_type,file_size_bytes,content_sha256,processing_status,metadata",
    )
    .eq("id", job.subject_id)
    .eq("organization_id", job.organization_id)
    .single();
  if (error || !document)
    throw new Error("The queued document no longer exists");
  const documentMetadata = asObject(document.metadata);
  const existingGeneration = Number(documentMetadata.ingestion_generation ?? 0);
  const generation =
    Number.isSafeInteger(existingGeneration) && existingGeneration >= 0
      ? existingGeneration
      : 0;
  if (document.processing_status === "indexed") {
    return {
      documentId: document.id,
      status: "indexed",
      alreadyComplete: true,
    };
  }
  if (document.processing_status === "embedding") {
    const { data: firstPending, error: pendingError } = await admin
      .from("document_chunks")
      .select("chunk_index")
      .eq("organization_id", document.organization_id)
      .eq("document_id", document.id)
      .is("embedding", null)
      .order("chunk_index")
      .limit(1)
      .maybeSingle();
    if (pendingError)
      throw new Error(
        `Unable to resume document embedding: ${pendingError.message}`,
      );
    if (!firstPending) {
      const { error: indexedError } = await admin
        .from("documents")
        .update({
          processing_status: "indexed",
          processing_error: null,
          indexed_at: new Date().toISOString(),
        })
        .eq("id", document.id)
        .eq("organization_id", document.organization_id);
      if (indexedError)
        throw new Error(
          `Unable to finalize document indexing: ${indexedError.message}`,
        );
      return { documentId: document.id, status: "indexed", resumed: true };
    }
    await enqueueJob({
      organizationId: document.organization_id,
      jobType: "embed_document_batch",
      subjectType: "document_embedding",
      subjectId: document.id,
      idempotencyKey: `embed:${document.id}:g${generation}:c${firstPending.chunk_index}`,
      payload: { generation, start_index: firstPending.chunk_index },
      maxAttempts: 5,
    });
    return {
      documentId: document.id,
      status: "embedding",
      generation,
      resumedAtChunk: firstPending.chunk_index,
    };
  }
  const { data: blob, error: downloadError } = await admin.storage
    .from("policy-documents")
    .download(document.storage_path);
  if (downloadError || !blob)
    throw new Error(
      "The protected document could not be downloaded for processing",
    );
  const settings = await loadOrganizationRuntimeSettings(
    admin,
    job.organization_id,
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  const expectedSize = Number(document.file_size_bytes);
  if (
    bytes.byteLength !== expectedSize ||
    actualHash !== document.content_sha256
  ) {
    await admin
      .from("documents")
      .update({
        processing_status: "failed",
        processing_error:
          "Stored file integrity check failed. Upload the original document again.",
      })
      .eq("id", document.id)
      .eq("organization_id", document.organization_id);
    throw new Error(
      "The stored document failed its size or SHA-256 integrity check",
    );
  }
  if (
    document.processing_status === "uploaded" ||
    document.processing_status === "failed"
  ) {
    const { error: extractingError } = await admin
      .from("documents")
      .update({ processing_status: "extracting", processing_error: null })
      .eq("id", document.id)
      .eq("organization_id", document.organization_id);
    if (extractingError)
      throw new Error(
        `Unable to begin document extraction: ${extractingError.message}`,
      );
  }
  const extracted = await extractDocument(
    {
      fileName: document.original_filename,
      mimeType: document.mime_type,
      bytes,
    },
    { maxBytes: 20 * 1024 * 1024 },
  );
  const repository = new SupabaseDocumentChunkRepository(
    admin,
    job.organization_id,
  );
  const duplicate = await repository.findDuplicate(
    document.organization_id,
    extracted.fileHash,
  );
  if (duplicate && duplicate.documentId !== document.id) {
    throw new Error(
      `This file is already indexed as document ${duplicate.documentId}`,
    );
  }
  if (document.processing_status !== "chunking") {
    const { error: chunkingError } = await admin
      .from("documents")
      .update({
        processing_status: "chunking",
        processing_error: null,
        content_sha256: extracted.fileHash,
      })
      .eq("id", document.id)
      .eq("organization_id", document.organization_id);
    if (chunkingError)
      throw new Error(
        `Unable to begin document chunking: ${chunkingError.message}`,
      );
  }
  const chunks = chunkDocument(
    extracted,
    {
      organizationId: document.organization_id,
      documentId: document.id,
      title: document.title,
      description: document.description ?? "",
      category: document.category,
      version: document.version,
      effectiveDate: document.effective_date,
      departmentId: document.department_id,
      designation: document.designation,
      storagePath: document.storage_path,
    },
    { chunkSize: settings.chunkSize, overlap: settings.chunkOverlap },
  );
  if (chunks.length === 0)
    throw new Error("Chunking produced no indexable policy text");
  await repository.replaceStagedDocumentChunks(document.id, chunks);
  const nextGeneration = generation + 1;
  const { error: embeddingError } = await admin
    .from("documents")
    .update({
      processing_status: "embedding",
      processing_error: null,
      content_sha256: extracted.fileHash,
      indexed_at: null,
      metadata: {
        ...documentMetadata,
        chunk_count: chunks.length,
        ingestion_generation: nextGeneration,
      },
    })
    .eq("id", document.id)
    .eq("organization_id", document.organization_id);
  if (embeddingError)
    throw new Error(
      `Unable to begin document embedding: ${embeddingError.message}`,
    );
  await enqueueJob({
    organizationId: document.organization_id,
    jobType: "embed_document_batch",
    subjectType: "document_embedding",
    subjectId: document.id,
    idempotencyKey: `embed:${document.id}:g${nextGeneration}:c0`,
    payload: { generation: nextGeneration, start_index: 0 },
    maxAttempts: 5,
  });
  return {
    documentId: document.id,
    fileHash: extracted.fileHash,
    chunkCount: chunks.length,
    generation: nextGeneration,
    status: "embedding",
    warningMessages: extracted.warnings,
  };
}

async function processEmbeddingBatch(job: BackgroundJob) {
  const admin = createAdminSupabaseClient();
  const payload = asObject(job.payload);
  const generation = z.coerce
    .number()
    .int()
    .positive()
    .parse(payload.generation);
  const startIndex = z.coerce.number().int().min(0).parse(payload.start_index);
  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("id,organization_id,processing_status,metadata")
    .eq("id", job.subject_id)
    .eq("organization_id", job.organization_id)
    .single();
  if (documentError || !document)
    throw new Error("The embedding document no longer exists");
  const metadata = asObject(document.metadata);
  const currentGeneration = Number(metadata.ingestion_generation ?? 0);
  if (currentGeneration !== generation) {
    return { documentId: document.id, status: "superseded", generation };
  }
  if (document.processing_status === "indexed") {
    return {
      documentId: document.id,
      status: "indexed",
      alreadyComplete: true,
    };
  }
  if (document.processing_status !== "embedding") {
    throw new Error("The document is not ready for embedding");
  }

  const endIndex = startIndex + EMBEDDING_BATCH_SIZE;
  const { data: chunks, error: chunkError } = await admin
    .from("document_chunks")
    .select(
      "id,organization_id,document_id,department_id,document_version,category,effective_date,storage_path,page_number,section_heading,chunk_index,content,token_count,metadata",
    )
    .eq("organization_id", document.organization_id)
    .eq("document_id", document.id)
    .gte("chunk_index", startIndex)
    .lt("chunk_index", endIndex)
    .is("embedding", null)
    .order("chunk_index");
  if (chunkError)
    throw new Error(`Unable to load an embedding batch: ${chunkError.message}`);

  if ((chunks ?? []).length > 0) {
    const stack = createSupabaseAIStack({
      supabase: admin,
      organizationId: document.organization_id,
      userId: undefined,
      openAI: { timeoutMs: 18_000, maxRetries: 1 },
    });
    const embeddings = await stack.openAI.embed({
      operation: "document.embedding.batch",
      organizationId: document.organization_id,
      inputs: (chunks ?? []).map((chunk) => chunk.content),
      dimensions: 1536,
      metadata: {
        organizationId: document.organization_id,
        documentId: document.id,
        generation,
        startIndex,
      },
    });
    if (
      embeddings.length !== (chunks ?? []).length ||
      embeddings.some((embedding) => embedding.length !== 1536)
    ) {
      throw new Error(
        "Embedding service returned an unexpected vector count or dimension",
      );
    }
    const embeddedRows = (chunks ?? []).map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }));
    const { error: saveError } = await admin
      .from("document_chunks")
      .upsert(embeddedRows, { onConflict: "document_id,chunk_index" });
    if (saveError)
      throw new Error(
        `Unable to persist an embedding batch: ${saveError.message}`,
      );
  }

  const { count: remaining, error: countError } = await admin
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", document.organization_id)
    .eq("document_id", document.id)
    .is("embedding", null);
  if (countError)
    throw new Error(
      `Unable to verify embedding progress: ${countError.message}`,
    );
  if ((remaining ?? 0) === 0) {
    const { error: indexedError } = await admin
      .from("documents")
      .update({
        processing_status: "indexed",
        processing_error: null,
        indexed_at: new Date().toISOString(),
      })
      .eq("id", document.id)
      .eq("organization_id", document.organization_id);
    if (indexedError)
      throw new Error(
        `Unable to finalize document indexing: ${indexedError.message}`,
      );
    return { documentId: document.id, status: "indexed", generation };
  }

  const { data: nextChunk, error: nextError } = await admin
    .from("document_chunks")
    .select("chunk_index")
    .eq("organization_id", document.organization_id)
    .eq("document_id", document.id)
    .is("embedding", null)
    .order("chunk_index")
    .limit(1)
    .single();
  if (nextError || !nextChunk)
    throw new Error("Unable to locate the next embedding batch");
  await enqueueJob({
    organizationId: document.organization_id,
    jobType: "embed_document_batch",
    subjectType: "document_embedding",
    subjectId: document.id,
    idempotencyKey: `embed:${document.id}:g${generation}:c${nextChunk.chunk_index}`,
    payload: { generation, start_index: nextChunk.chunk_index },
    maxAttempts: 5,
  });
  return {
    documentId: document.id,
    status: "embedding",
    generation,
    completedThrough: endIndex - 1,
    remaining,
  };
}

async function loadWorkflowState(job: BackgroundJob): Promise<{
  state: PolicyWorkflowState;
  requesterId: string;
}> {
  if (!job.workflow_run_id)
    throw new Error("The analysis job has no workflow run");
  const admin = createAdminSupabaseClient();
  const { data: run, error: runError } = await admin
    .from("workflow_runs")
    .select("id,thread_id,state,created_by,comparison_id")
    .eq("id", job.workflow_run_id)
    .eq("organization_id", job.organization_id)
    .single();
  if (runError || !run?.comparison_id)
    throw new Error("The workflow run could not be restored");
  const { data: comparison, error: comparisonError } = await admin
    .from("policy_comparisons")
    .select("id,requested_by,old_document_id,new_document_id")
    .eq("id", run.comparison_id)
    .eq("organization_id", job.organization_id)
    .single();
  if (comparisonError || !comparison)
    throw new Error("The policy comparison could not be restored");
  const requesterId = comparison.requested_by ?? run.created_by;
  if (!requesterId)
    throw new Error("The workflow does not have an accountable requester");

  const parsed = PolicyWorkflowStateSchema.safeParse(run.state);
  if (parsed.success) return { state: parsed.data, requesterId };

  const { data: documents, error: documentError } = await admin
    .from("documents")
    .select(
      "id,title,version,category,department_id,effective_date,storage_path,designation",
    )
    .eq("organization_id", job.organization_id)
    .in("id", [comparison.old_document_id, comparison.new_document_id]);
  if (documentError || documents?.length !== 2) {
    throw new Error(
      "Both policy versions are required to initialize the workflow",
    );
  }
  const { data: departments, error: departmentError } = await admin
    .from("departments")
    .select("name")
    .eq("organization_id", job.organization_id)
    .eq("is_active", true);
  if (departmentError) throw departmentError;
  const oldDocument = documents.find(
    (document) => document.id === comparison.old_document_id,
  );
  const newDocument = documents.find(
    (document) => document.id === comparison.new_document_id,
  );
  if (!oldDocument || !newDocument)
    throw new Error("The comparison documents are incomplete");
  const settings = await loadOrganizationRuntimeSettings(
    admin,
    job.organization_id,
  );
  return {
    requesterId,
    state: createInitialWorkflowState({
      runId: run.id,
      threadId: run.thread_id,
      organizationId: job.organization_id,
      comparisonId: comparison.id,
      requestedBy: requesterId,
      oldDocument: {
        documentId: oldDocument.id,
        title: oldDocument.title,
        version: oldDocument.version,
        category: oldDocument.category,
        departmentId: oldDocument.department_id,
        effectiveDate: oldDocument.effective_date,
        storagePath: oldDocument.storage_path,
        designation: oldDocument.designation,
      },
      newDocument: {
        documentId: newDocument.id,
        title: newDocument.title,
        version: newDocument.version,
        category: newDocument.category,
        departmentId: newDocument.department_id,
        effectiveDate: newDocument.effective_date,
        storagePath: newDocument.storage_path,
        designation: newDocument.designation,
      },
      knownDepartments: (departments ?? []).map(
        (department) => department.name,
      ),
      maxAutomaticRevisions: settings.maxAutomaticRevisions,
      qualityThreshold: settings.qualityThreshold,
    }),
  };
}

async function approvalResume(job: BackgroundJob, state: PolicyWorkflowState) {
  if (
    state.currentNode !== "human_approval" ||
    state.status !== "awaiting_approval"
  ) {
    return undefined;
  }
  const admin = createAdminSupabaseClient();
  const { data: request } = await admin
    .from("approval_requests")
    .select("id,status")
    .eq("workflow_run_id", job.workflow_run_id)
    .eq("organization_id", job.organization_id)
    .neq("status", "pending")
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request) return undefined;
  const { data: decision } = await admin
    .from("approval_decisions")
    .select("decision,reviewer_id,notes")
    .eq("approval_request_id", request.id)
    .eq("organization_id", job.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return decision
    ? {
        decision: decision.decision,
        reviewerId: decision.reviewer_id,
        notes: decision.notes,
      }
    : undefined;
}

async function persistApprovalRequest(
  job: BackgroundJob,
  state: PolicyWorkflowState,
) {
  if (!state.comparisonId || !job.workflow_run_id) return;
  const admin = createAdminSupabaseClient();
  const { data: existing } = await admin
    .from("approval_requests")
    .select("id")
    .eq("comparison_id", state.comparisonId)
    .eq("analysis_version", state.analysisVersion)
    .eq("status", "pending")
    .maybeSingle();
  if (!existing) {
    const overallRisk = state.riskAssessment?.overallRisk;
    const escalatedRisk = overallRisk === "critical" ? "critical" : "high";
    const reason =
      overallRisk === "high" || overallRisk === "critical"
        ? `${overallRisk} risk requires human approval before publication.`
        : "Quality review requires human judgment before publication.";
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const { error } = await admin.from("approval_requests").insert({
      organization_id: state.organizationId,
      comparison_id: state.comparisonId,
      workflow_run_id: job.workflow_run_id,
      requested_by: state.requestedBy,
      status: "pending",
      risk_level: escalatedRisk,
      reason,
      analysis_version: state.analysisVersion,
      due_at: dueAt,
    });
    if (error)
      throw new Error(
        `Unable to create the human approval request: ${error.message}`,
      );
  }
  await admin
    .from("policy_comparisons")
    .update({ status: "awaiting_approval" })
    .eq("id", state.comparisonId)
    .eq("organization_id", state.organizationId);
}

async function processPolicyAnalysis(job: BackgroundJob) {
  const admin = createAdminSupabaseClient();
  const { state, requesterId } = await loadWorkflowState(job);
  const resume = await approvalResume(job, state);
  if (state.status === "awaiting_approval" && !resume) {
    await persistApprovalRequest(job, state);
    return { status: "awaiting_approval", currentNode: state.currentNode };
  }
  const workflow = createSupabasePolicyWorkflow({
    supabase: admin,
    organizationId: job.organization_id,
    userId: requesterId,
    executionMode: "bounded",
    // Keep a tick inside the route's 60-second execution budget. Durable job
    // retries resume from the checkpoint, so nested SDK/graph retries only make
    // failures slower and can cause the HTTP worker itself to time out.
    openAI: { timeoutMs: 60_000, maxRetries: 0 },
    nodeTimeoutMs: 75_000,
    nodeMaxAttempts: 1,
  });
  const result = await advancePolicyWorkflow(workflow.graph, {
    state,
    approval: resume,
  });
  const { data: persistedRun } = await admin
    .from("workflow_runs")
    .select("state")
    .eq("id", job.workflow_run_id)
    .eq("organization_id", job.organization_id)
    .maybeSingle();
  const persistedState = PolicyWorkflowStateSchema.safeParse(
    persistedRun?.state,
  );
  const durableState = persistedState.success
    ? persistedState.data
    : result.state;
  if (result.awaitingApproval || durableState.status === "awaiting_approval") {
    await persistApprovalRequest(job, durableState);
    return {
      status: "awaiting_approval",
      currentNode: durableState.currentNode,
    };
  }
  if (!result.completed) {
    const next = result.nextNodes[0] ?? "unknown";
    await enqueueJob({
      organizationId: job.organization_id,
      jobType: "advance_policy_analysis",
      subjectType: "policy_comparison",
      subjectId: job.subject_id,
      workflowRunId: job.workflow_run_id,
      idempotencyKey: [
        "analysis",
        job.workflow_run_id ?? durableState.runId,
        `v${durableState.analysisVersion}`,
        `r${durableState.totalRevisionCount}`,
        `e${durableState.evidenceAttempts}`,
        next,
      ].join(":"),
    });
  }
  return {
    status: durableState.status,
    currentNode: durableState.currentNode,
    nextNodes: result.nextNodes,
    completed: result.completed,
  };
}

async function processEvaluation(job: BackgroundJob) {
  const admin = createAdminSupabaseClient();
  const payload = asObject(job.payload);
  const runId =
    typeof payload.run_id === "string" ? payload.run_id : job.subject_id;
  const runLabel =
    typeof payload.run_label === "string" ? payload.run_label : `eval-${runId}`;
  const requestedBy =
    typeof payload.requested_by === "string" ? payload.requested_by : undefined;
  const comparisonId = z.uuid().optional().parse(payload.comparison_id);
  const datasetVersion = z
    .string()
    .min(1)
    .max(40)
    .default(EVALUATION_DATASET_VERSION)
    .parse(payload.dataset_version);
  const metricVersion = z
    .string()
    .min(1)
    .max(40)
    .default(EVALUATION_METRIC_VERSION)
    .parse(payload.metric_version);
  const promptVersion = z
    .string()
    .min(1)
    .max(40)
    .default(EVALUATION_PROMPT_VERSION)
    .parse(payload.prompt_version);
  const variants = z
    .array(
      z.enum([
        "openai_without_rag",
        "openai_with_rag",
        "rag_agents_reflection",
      ]),
    )
    .min(1)
    .parse(payload.variants);
  const requestedQuestionIds = z
    .array(z.uuid())
    .default([])
    .parse(payload.question_ids);
  const cursor = z.number().int().min(0).default(0).parse(payload.cursor);
  let query = admin
    .from("evaluation_questions")
    .select(
      "id,external_id,question,expected_answer,category,expected_sources,expected_change_types",
    )
    .eq("organization_id", job.organization_id)
    .eq("is_active", true)
    .order("external_id");
  if (requestedQuestionIds.length) query = query.in("id", requestedQuestionIds);
  const { data: rawQuestions, error } = await query;
  if (error) throw error;
  const questions = (rawQuestions ?? []) as unknown as EvaluationQuestionRow[];
  const work = questions.flatMap((question) =>
    variants.map((variant) => ({ question, variant })),
  );
  const item = work[cursor];
  if (!item) return { runId, runLabel, evaluated: cursor, completed: true };

  const capturedUsage: Array<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }> = [];
  const stack = createSupabaseAIStack({
    supabase: admin,
    organizationId: job.organization_id,
    userId: requestedBy,
    usageHook: (event) => {
      if (event.status === "succeeded") capturedUsage.push(event);
    },
    openAI: { timeoutMs: 10_000, maxRetries: 0 },
  });
  const startedAt = performance.now();
  let answer = "";
  let citations: Citation[] = [];
  if (item.variant === "openai_without_rag") {
    const response = await stack.openAI.generateText({
      operation: "evaluation.openai_without_rag",
      system:
        "Answer concisely. You have not been given the organization's policy documents. Do not claim access to them, do not fabricate policy facts, and explicitly state when the necessary evidence is unavailable.",
      prompt: buildUntrustedInputPrompt(
        "Answer the evaluation question without retrieval context.",
        {
          question: item.question.question,
        },
      ),
      maxOutputTokens: 500,
    });
    answer = response.text;
  } else {
    const result = await import("@/lib/rag").then(({ answerPolicyQuestion }) =>
      answerPolicyQuestion(
        item.question.question,
        {
          organizationId: job.organization_id,
          documentIds: [],
          departmentIds: [],
          versions: [],
          category: null,
        },
        stack.rag,
        item.variant === "openai_with_rag"
          ? { limit: 8, rewriteQuery: false, rerank: false }
          : { limit: 10, candidateLimit: 24, rewriteQuery: true, rerank: true },
        { userId: requestedBy },
      ),
    );
    answer = result.answer;
    citations = result.citations;
    if (item.variant === "rag_agents_reflection" && citations.length) {
      const reflection = await stack.openAI.generateObject({
        operation: "evaluation.self_reflection",
        system:
          "Review the answer only against the supplied untrusted evidence. Check support, citation metadata, completeness, and hallucinations. If quality is below 0.80, return a corrected answer using only that evidence.",
        prompt: buildUntrustedInputPrompt(
          "Perform a concise evidence-grounded self-review.",
          {
            question: item.question.question,
            answer,
            evidence: citations.map((citation) => ({
              document: citation.documentTitle,
              version: citation.version,
              page: citation.pageNumber,
              section: citation.sectionHeading,
              snippet: citation.evidenceSnippet,
            })),
          },
        ),
        schema: ReflectionSchema,
        schemaName: "evaluation_self_reflection",
        maxOutputTokens: 900,
      });
      if (!reflection.passed || reflection.qualityScore < 0.8) {
        answer = reflection.revisedAnswer.trim() || answer;
      }
    }
  }

  const expectedIds = expectedSourceIds(item.question);
  const retrieved = citations.map((citation) => ({
    id: citation.chunkId,
    relevanceId: relevanceIdForCitation(citation, item.question),
    content: citation.evidenceSnippet,
  }));
  const retrievedIds = retrieved.map(
    (evidence) => evidence.relevanceId ?? evidence.id,
  );
  const contexts = retrieved.map((evidence) => evidence.content);
  const labels = inferredFindingLabels(answer);
  const faithful = faithfulness(answer, contexts);
  const inputTokens = capturedUsage.reduce(
    (sum, event) => sum + event.inputTokens,
    0,
  );
  const outputTokens = capturedUsage.reduce(
    (sum, event) => sum + event.outputTokens,
    0,
  );
  const cost = capturedUsage.reduce(
    (sum, event) => sum + event.estimatedCostUsd,
    0,
  );
  const row = {
    organization_id: job.organization_id,
    evaluation_question_id: item.question.id,
    run_id: runId,
    comparison_id: comparisonId ?? null,
    dataset_version: datasetVersion,
    metric_version: metricVersion,
    prompt_version: promptVersion,
    model: stack.openAI.chatModel,
    variant: item.variant,
    run_label: runLabel,
    answer: answer || "Evaluation produced no answer.",
    citations,
    retrieval_precision: retrievalPrecision(retrievedIds, expectedIds),
    retrieval_recall: retrievalRecall(retrievedIds, expectedIds),
    context_relevance: contextRelevance(item.question.question, contexts),
    answer_relevance: answerRelevance(item.question.question, answer, [
      item.question.expected_answer,
    ]),
    faithfulness: faithful,
    citation_correctness: citationCorrectness(answer, citations),
    change_detection_accuracy: setF1(
      labels.changeTypes,
      item.question.expected_change_types,
    ),
    conflict_detection_accuracy: setF1(
      labels.conflictLabels,
      item.question.category === "conflict_detection"
        ? ["direct_contradiction"]
        : [],
    ),
    unsupported_claim_rate: Math.max(0, Math.min(1, 1 - faithful)),
    latency_ms: Math.round(performance.now() - startedAt),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: Number(cost.toFixed(6)),
    evaluator_notes:
      item.variant === "rag_agents_reflection"
        ? "Hybrid RAG with reranking and evidence-grounded self-reflection."
        : item.variant === "openai_with_rag"
          ? "Hybrid RAG without agentic self-reflection."
          : "OpenAI baseline without retrieved policy evidence.",
    created_by: requestedBy,
  };
  const { error: saveError } = await admin
    .from("evaluation_results")
    .insert(row);
  if (saveError)
    throw new Error(`Unable to save evaluation result: ${saveError.message}`);

  if (cursor + 1 < work.length) {
    await enqueueJob({
      organizationId: job.organization_id,
      jobType: "run_evaluation",
      subjectType: "evaluation_run",
      subjectId: runId,
      idempotencyKey: `evaluation:${runId}:${cursor + 1}`,
      payload: { ...payload, cursor: cursor + 1 },
      maxAttempts: 3,
    });
  }
  return {
    runId,
    runLabel,
    cursor,
    total: work.length,
    question: item.question.external_id,
    variant: item.variant,
    completed: cursor + 1 >= work.length,
  };
}

async function processClaimedJob(job: BackgroundJob) {
  switch (job.job_type) {
    case "ingest_document":
      return processIngestion(job);
    case "embed_document_batch":
      return processEmbeddingBatch(job);
    case "advance_policy_analysis":
      return processPolicyAnalysis(job);
    case "run_evaluation":
      return processEvaluation(job);
    default:
      throw new Error(`Unsupported background job type: ${job.job_type}`);
  }
}

export async function runBackgroundJobTick(limit = 3) {
  const admin = createAdminSupabaseClient();
  const workerId = randomUUID();
  const jobs = await claimBackgroundJobs(
    workerId,
    Math.max(1, Math.min(10, limit)),
    90,
  );
  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const heartbeat = setInterval(() => {
      void heartbeatBackgroundJob(job.id, workerId, 90)
        .then((renewed) => {
          if (!renewed) {
            console.error("Background job lease heartbeat failed", {
              jobId: job.id,
              code: "LEASE_LOST",
            });
          }
        })
        .catch((heartbeatError: unknown) => {
          console.error("Background job lease heartbeat failed", {
            jobId: job.id,
            code:
              heartbeatError instanceof Error
                ? heartbeatError.name
                : "POOLER_HEARTBEAT_FAILED",
          });
        });
    }, 25_000);
    try {
      const result = await processClaimedJob(job);
      const completed = await completeBackgroundJob(
        job.id,
        workerId,
        asObject(result),
      );
      if (!completed) {
        throw new Error("The background job lease was lost before completion");
      }
      results.push({ jobId: job.id, type: job.job_type, status: "completed" });
    } catch (jobError) {
      const delay = Math.min(900, 15 * 2 ** Math.max(0, job.attempts - 1));
      const safeError = safeJobError(jobError);
      const failed = await failBackgroundJob(
        job.id,
        workerId,
        safeError,
        delay,
      );
      if (!failed) {
        throw new Error(
          "The background job lease was lost while recording failure",
        );
      }
      if (job.attempts >= job.max_attempts) {
        if (
          job.job_type === "ingest_document" ||
          job.job_type === "embed_document_batch"
        ) {
          await admin
            .from("documents")
            .update({
              processing_status: "failed",
              processing_error: safeError.message,
            })
            .eq("id", job.subject_id)
            .eq("organization_id", job.organization_id);
        }
        if (job.job_type === "advance_policy_analysis") {
          if (job.workflow_run_id) {
            await admin
              .from("workflow_runs")
              .update({ status: "failed", last_error: safeError })
              .eq("id", job.workflow_run_id)
              .eq("organization_id", job.organization_id);
          }
          await admin
            .from("policy_comparisons")
            .update({ status: "failed", failure_reason: safeError.message })
            .eq("id", job.subject_id)
            .eq("organization_id", job.organization_id);
        }
      }
      results.push({
        jobId: job.id,
        type: job.job_type,
        status: "failed_or_retried",
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
  return { workerId, claimed: jobs.length, results };
}
