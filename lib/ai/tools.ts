import { z, type ZodType } from "zod";

import {
  CitationSchema,
  PolicyRuleSchema,
  type Citation,
  type PolicyRule,
} from "./schemas";

export const AGENT_TOOL_NAMES = [
  "hybrid_policy_search",
  "citation_lookup",
  "policy_rule_lookup",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export interface AgentToolDescriptor {
  name: AgentToolName;
  purpose: string;
  readOnly: true;
}

export interface AgentToolExecutionContext {
  organizationId?: string;
  userId?: string;
  workflowId?: string;
  signal?: AbortSignal;
}

export interface AgentTool extends AgentToolDescriptor {
  inputSchema: ZodType;
  outputSchema: ZodType;
  execute(input: unknown, context: AgentToolExecutionContext): Promise<unknown>;
}

export type AgentToolRegistry = Partial<Record<AgentToolName, AgentTool>>;

export const CitationLookupInputSchema = z.object({
  chunkIds: z.array(z.string().min(1)).max(50).default([]),
});

export const CitationLookupOutputSchema = z.object({
  citations: z.array(CitationSchema).max(50),
  missingChunkIds: z.array(z.string().min(1)).max(50),
});

export const PolicyRuleLookupInputSchema = z.object({
  ruleIds: z.array(z.string().min(1)).max(50).default([]),
});

export const PolicyRuleLookupOutputSchema = z.object({
  rules: z.array(PolicyRuleSchema).max(50),
  missingRuleIds: z.array(z.string().min(1)).max(50),
});

export const HybridPolicySearchInputSchema = z.object({
  query: z.string().trim().min(1).max(4_000),
  documentIds: z.array(z.string().min(1)).max(100).default([]),
  versions: z.array(z.string().min(1)).max(50).default([]),
  limit: z.number().int().min(1).max(12).default(8),
});

export const HybridPolicySearchOutputSchema = z.object({
  rewrittenQueries: z.array(z.string().min(1)).max(4),
  citations: z.array(CitationSchema).max(12),
  sufficientEvidence: z.boolean(),
  insufficiencyReason: z.string().nullable(),
});

function visitObjects(
  value: unknown,
  visitor: (candidate: unknown) => void,
  seen = new Set<object>(),
  depth = 0,
): void {
  if (depth > 24 || value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visitor, seen, depth + 1);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    visitObjects(item, visitor, seen, depth + 1);
  }
}

export function collectCitations(value: unknown): Citation[] {
  const citations = new Map<string, Citation>();
  visitObjects(value, (candidate) => {
    const parsed = CitationSchema.safeParse(candidate);
    if (parsed.success && !citations.has(parsed.data.chunkId)) {
      citations.set(parsed.data.chunkId, parsed.data);
    }
  });
  return [...citations.values()];
}

export function collectPolicyRules(value: unknown): PolicyRule[] {
  const rules = new Map<string, PolicyRule>();
  visitObjects(value, (candidate) => {
    const parsed = PolicyRuleSchema.safeParse(candidate);
    if (parsed.success && !rules.has(parsed.data.id))
      rules.set(parsed.data.id, parsed.data);
  });
  return [...rules.values()];
}

export function createInputBoundAgentTools(
  rawInput: unknown,
): AgentToolRegistry {
  const citations = new Map(
    collectCitations(rawInput).map((citation) => [citation.chunkId, citation]),
  );
  const rules = new Map(
    collectPolicyRules(rawInput).map((rule) => [rule.id, rule]),
  );

  return {
    citation_lookup: {
      name: "citation_lookup",
      purpose:
        "Resolve supplied evidence chunk IDs to their canonical, authorized citation metadata.",
      readOnly: true,
      inputSchema: CitationLookupInputSchema,
      outputSchema: CitationLookupOutputSchema,
      async execute(rawToolInput) {
        const input = CitationLookupInputSchema.parse(rawToolInput);
        const requested = input.chunkIds.length
          ? input.chunkIds
          : [...citations.keys()].slice(0, 50);
        return CitationLookupOutputSchema.parse({
          citations: requested.flatMap((chunkId) => {
            const citation = citations.get(chunkId);
            return citation ? [citation] : [];
          }),
          missingChunkIds: requested.filter(
            (chunkId) => !citations.has(chunkId),
          ),
        });
      },
    },
    policy_rule_lookup: {
      name: "policy_rule_lookup",
      purpose:
        "Resolve supplied rule IDs to structured rules already authorized for this agent run.",
      readOnly: true,
      inputSchema: PolicyRuleLookupInputSchema,
      outputSchema: PolicyRuleLookupOutputSchema,
      async execute(rawToolInput) {
        const input = PolicyRuleLookupInputSchema.parse(rawToolInput);
        const requested = input.ruleIds.length
          ? input.ruleIds
          : [...rules.keys()].slice(0, 50);
        return PolicyRuleLookupOutputSchema.parse({
          rules: requested.flatMap((ruleId) => {
            const rule = rules.get(ruleId);
            return rule ? [rule] : [];
          }),
          missingRuleIds: requested.filter((ruleId) => !rules.has(ruleId)),
        });
      },
    },
  };
}
