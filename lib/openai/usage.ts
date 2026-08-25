import type { SupabaseClient } from "@supabase/supabase-js";

export type AIUsageStatus = "succeeded" | "failed";

export interface AIUsageEvent {
  organizationId?: string;
  model: string;
  operation: string;
  userId?: string;
  workflowId?: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: AIUsageStatus;
  errorType?: string;
  errorMessage?: string;
  attempt: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type AIUsageHook = (event: AIUsageEvent) => Promise<void> | void;

interface ModelPrice {
  input: number;
  output: number;
}

const DEFAULT_PRICE_PER_MILLION_TOKENS: Record<string, ModelPrice> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

function parsePriceOverrides(raw: string | undefined): Record<string, ModelPrice> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([model, value]) => {
        if (!value || typeof value !== "object") return [];
        const record = value as Record<string, unknown>;
        const input = Number(record.input);
        const output = Number(record.output);
        return Number.isFinite(input) && Number.isFinite(output)
          ? [[model, { input, output } satisfies ModelPrice]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

export function estimateOpenAICost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  overrides = parsePriceOverrides(process.env.OPENAI_PRICE_PER_MILLION_JSON),
): number {
  const prices = { ...DEFAULT_PRICE_PER_MILLION_TOKENS, ...overrides };
  const exact = prices[model];
  const prefix = Object.entries(prices)
    .filter(([key]) => model.startsWith(key))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1];
  const price = exact ?? prefix;
  if (!price) return 0;
  return Number(
    (((Math.max(inputTokens, 0) * price.input + Math.max(outputTokens, 0) * price.output) / 1_000_000)).toFixed(8),
  );
}

export class SupabaseUsageLogger {
  constructor(private readonly supabase: SupabaseClient) {}

  readonly log: AIUsageHook = async (event) => {
    const { error } = await this.supabase.from("ai_usage_logs").insert({
      organization_id: event.organizationId ?? null,
      model: event.model,
      operation: event.operation,
      user_id: event.userId ?? null,
      workflow_run_id: event.workflowId ?? null,
      request_id: event.requestId,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      estimated_cost_usd: event.estimatedCostUsd,
      latency_ms: event.latencyMs,
      status: event.status,
      error_type: event.errorType ?? null,
      error_message: event.errorMessage ?? null,
      metadata: { ...event.metadata, attempt: event.attempt },
      created_at: event.createdAt,
    });
    if (error) throw new Error(`Unable to persist AI usage: ${error.message}`);
  };
}

export function composeUsageHooks(...hooks: Array<AIUsageHook | undefined>): AIUsageHook {
  return async (event) => {
    const results = await Promise.allSettled(hooks.filter(Boolean).map((hook) => hook?.(event)));
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") {
      console.error("AI usage hook failed", rejected.reason);
    }
  };
}
