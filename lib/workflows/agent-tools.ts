import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HybridPolicySearchInputSchema,
  HybridPolicySearchOutputSchema,
  type AgentTool,
} from "@/lib/ai";
import { retrievePolicyEvidence, type HybridRAGServices } from "@/lib/rag";

export interface RAGPolicySearchToolScope {
  organizationId: string;
  authorizedDepartmentIds: string[];
  resolveAuthorizedDepartmentIds?: () => Promise<string[]>;
}

const ORGANIZATION_WIDE_ROLES = new Set([
  "administrator",
  "policy_manager",
  "auditor",
]);

export function createRequesterDepartmentScopeResolver(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): () => Promise<string[]> {
  return async () => {
    const { data: rawMembership, error: membershipError } = await supabase
      .from("memberships")
      .select("role,department_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) {
      throw new Error(
        `Unable to resolve workflow authorization scope: ${membershipError.message}`,
      );
    }
    const membership = rawMembership as unknown as {
      role: string;
      department_id: string | null;
    } | null;
    if (!membership)
      throw new Error(
        "The workflow requester has no active organization membership",
      );
    if (ORGANIZATION_WIDE_ROLES.has(membership.role)) return [];

    const { data: rawAssignments, error: assignmentsError } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .limit(99);
    if (assignmentsError) {
      throw new Error(
        `Unable to resolve workflow department scope: ${assignmentsError.message}`,
      );
    }
    const assignments = (rawAssignments ?? []) as unknown as Array<{
      department_id: string;
    }>;
    const departmentIds = new Set(
      [
        membership.department_id,
        ...assignments.map((item) => item.department_id),
      ].filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    );
    if (departmentIds.size === 0) {
      throw new Error(
        "The workflow requester has no authorized department scope",
      );
    }
    return [...departmentIds];
  };
}

export function createRAGPolicySearchTool(
  rag: HybridRAGServices,
  scope: RAGPolicySearchToolScope,
): AgentTool {
  if (!scope.organizationId)
    throw new Error(
      "An organization ID is required for the policy search tool",
    );
  return {
    name: "hybrid_policy_search",
    purpose:
      "Run bounded hybrid search over organization- and department-authorized policy chunks.",
    readOnly: true,
    inputSchema: HybridPolicySearchInputSchema,
    outputSchema: HybridPolicySearchOutputSchema,
    async execute(rawInput, context) {
      if (
        context.organizationId &&
        context.organizationId !== scope.organizationId
      ) {
        throw new Error("Cross-organization agent tool execution is forbidden");
      }
      const input = HybridPolicySearchInputSchema.parse(rawInput);
      const departmentIds = scope.resolveAuthorizedDepartmentIds
        ? await scope.resolveAuthorizedDepartmentIds()
        : scope.authorizedDepartmentIds;
      const result = await retrievePolicyEvidence(
        input.query,
        {
          organizationId: scope.organizationId,
          documentIds: input.documentIds,
          departmentIds,
          versions: input.versions,
          category: null,
        },
        rag,
        {
          limit: input.limit,
          candidateLimit: Math.min(24, Math.max(input.limit, input.limit * 2)),
          minimumEvidence: 1,
          minimumEvidenceScore: 0.3,
          rewriteQuery: true,
          rerank: true,
        },
        {
          organizationId: scope.organizationId,
          userId: context.userId,
          workflowId: context.workflowId,
          signal: context.signal,
        },
      );
      return HybridPolicySearchOutputSchema.parse({
        rewrittenQueries: result.rewrittenQueries,
        citations: result.citations,
        sufficientEvidence: result.sufficientEvidence,
        insufficiencyReason: result.insufficiencyReason,
      });
    },
  };
}
