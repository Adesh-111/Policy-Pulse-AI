import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseDocumentChunkRepository } from "@/lib/documents";
import {
  createSupabaseAIStack,
  type CreateSupabaseAIStackOptions,
} from "@/lib/rag";

import { RAGWorkflowEvidenceService } from "./evidence";
import {
  createRAGPolicySearchTool,
  createRequesterDepartmentScopeResolver,
} from "./agent-tools";
import { createPolicyWorkflow } from "./graph";
import { SupabaseWorkflowMaterializer } from "./materializer";
import { OpenAIWorkflowAgentExecutor } from "./nodes";
import {
  SupabaseLangGraphCheckpointer,
  SupabaseWorkflowRunStore,
} from "./persistence";

export interface CreateSupabasePolicyWorkflowOptions {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  authorizedDepartmentIds?: string[];
  openAI?: CreateSupabaseAIStackOptions["openAI"];
  executionMode?: "bounded" | "continuous";
  nodeTimeoutMs?: number;
  nodeMaxAttempts?: number;
}

export function createSupabasePolicyWorkflow(
  options: CreateSupabasePolicyWorkflowOptions,
) {
  const ai = createSupabaseAIStack({
    supabase: options.supabase,
    organizationId: options.organizationId,
    userId: options.userId,
    openAI: options.openAI,
  });
  const checkpointer = new SupabaseLangGraphCheckpointer(
    options.supabase,
    options.organizationId,
  );
  const runStore = new SupabaseWorkflowRunStore(options.supabase);
  const materializer = new SupabaseWorkflowMaterializer(options.supabase);
  const resolveAuthorizedDepartmentIds =
    options.authorizedDepartmentIds === undefined
      ? createRequesterDepartmentScopeResolver(
          options.supabase,
          options.organizationId,
          options.userId,
        )
      : undefined;
  const evidence = new RAGWorkflowEvidenceService(
    ai.rag,
    options.authorizedDepartmentIds ?? [],
    resolveAuthorizedDepartmentIds,
  );
  const agents = new OpenAIWorkflowAgentExecutor(ai.openAI, {
    hybrid_policy_search: createRAGPolicySearchTool(ai.rag, {
      organizationId: options.organizationId,
      authorizedDepartmentIds: options.authorizedDepartmentIds ?? [],
      resolveAuthorizedDepartmentIds,
    }),
  });
  const graph = createPolicyWorkflow({
    checkpointer,
    executionMode: options.executionMode ?? "bounded",
    nodeTimeoutMs: options.nodeTimeoutMs,
    nodeMaxAttempts: options.nodeMaxAttempts,
    services: { agents, evidence, runStore, materializer },
  });
  return {
    graph,
    ai,
    checkpointer,
    runStore,
    materializer,
    documentRepository: new SupabaseDocumentChunkRepository(
      options.supabase,
      options.organizationId,
    ),
  };
}
