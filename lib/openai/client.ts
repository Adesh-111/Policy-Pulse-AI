import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z, type ZodType } from "zod";

import { getErrorType, getHttpStatus, isRetryableOpenAIError, OpenAIRequestError } from "./errors";
import { estimateOpenAICost, type AIUsageEvent, type AIUsageHook } from "./usage";

export interface OpenAIRequestContext {
  operation: string;
  organizationId?: string;
  userId?: string;
  workflowId?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface TextGenerationRequest extends OpenAIRequestContext {
  system: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
}

export interface StructuredGenerationRequest<TSchema extends ZodType> extends TextGenerationRequest {
  schema: TSchema;
  schemaName: string;
}

export interface EmbeddingRequest extends OpenAIRequestContext {
  inputs: string[];
  model?: string;
  dimensions?: number;
}

export interface OpenAIServiceOptions {
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  timeoutMs?: number;
  maxRetries?: number;
  usageHook?: AIUsageHook;
  client?: OpenAI;
  defaultOrganizationId?: string;
  defaultUserId?: string;
}

export interface TextGenerationResult {
  text: string;
  responseId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type StreamTextEvent =
  | { type: "text-delta"; delta: string }
  | { type: "completed"; response: TextGenerationResult };

interface UsageNumbers {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AttemptContext {
  attempt: number;
  signal: AbortSignal;
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function usageFromResponse(response: unknown): UsageNumbers {
  if (!response || typeof response !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const usage = (response as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = Number(record.input_tokens ?? record.prompt_tokens ?? 0);
  const outputTokens = Number(record.output_tokens ?? record.completion_tokens ?? 0);
  const totalTokens = Number(record.total_tokens ?? inputTokens + outputTokens);
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function sanitizeSchemaName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return sanitized || "structured_response";
}

function createCombinedSignal(timeoutMs: number, external?: AbortSignal): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new DOMException("OpenAI request timed out", "TimeoutError")),
    timeoutMs,
  );
  const signal = external
    ? AbortSignal.any([external, timeoutController.signal])
    : timeoutController.signal;
  return { signal, dispose: () => clearTimeout(timeout) };
}

function normalizeError(error: unknown, operation: string): OpenAIRequestError {
  if (error instanceof OpenAIRequestError) return error;
  const message = error instanceof Error ? error.message : "Unknown OpenAI request failure";
  return new OpenAIRequestError(message, operation, isRetryableOpenAIError(error), getHttpStatus(error), {
    cause: error,
  });
}

export class OpenAIService {
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly embeddingDimensions: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly usageHook?: AIUsageHook;
  private readonly client: OpenAI;
  private readonly defaultOrganizationId?: string;
  private readonly defaultUserId?: string;

  constructor(options: OpenAIServiceOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey && !options.client) {
      throw new Error("OPENAI_API_KEY is required on the server");
    }
    this.client =
      options.client ??
      new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
        maxRetries: 0,
      });
    this.chatModel = options.chatModel ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
    this.embeddingModel =
      options.embeddingModel ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.embeddingDimensions = options.embeddingDimensions ?? 1536;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.usageHook = options.usageHook;
    this.defaultOrganizationId = options.defaultOrganizationId;
    this.defaultUserId = options.defaultUserId;
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const model = request.model ?? this.chatModel;
    return this.withRetries(request, model, async ({ signal, attempt }) => {
      const startedAt = performance.now();
      const requestId = crypto.randomUUID();
      try {
        const response = await this.client.responses.create(
          {
            model,
            instructions: request.system,
            input: request.prompt,
            max_output_tokens: request.maxOutputTokens ?? 2_500,
          },
          { signal },
        );
        const usage = usageFromResponse(response);
        await this.recordUsage(request, model, usage, performance.now() - startedAt, "succeeded", attempt, undefined, undefined, response.id);
        return {
          text: response.output_text,
          responseId: response.id,
          ...usage,
        };
      } catch (error) {
        await this.recordUsage(
          request,
          model,
          { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          performance.now() - startedAt,
          "failed",
          attempt,
          getErrorType(error),
          error instanceof Error ? error.message : String(error),
          requestId,
        );
        throw error;
      }
    });
  }

  async generateObject<TSchema extends ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const model = request.model ?? this.chatModel;
    return this.withRetries(request, model, async ({ signal, attempt }) => {
      const startedAt = performance.now();
      const requestId = crypto.randomUUID();
      try {
        const response = await this.client.responses.parse(
          {
            model,
            instructions: request.system,
            input: request.prompt,
            max_output_tokens: request.maxOutputTokens ?? 3_500,
            text: {
              format: zodTextFormat(request.schema, sanitizeSchemaName(request.schemaName)),
            },
          },
          { signal },
        );
        if (response.output_parsed === null || response.output_parsed === undefined) {
          throw new OpenAIRequestError(
            "OpenAI returned no structured output",
            request.operation,
            true,
          );
        }
        const parsed = request.schema.parse(response.output_parsed);
        const usage = usageFromResponse(response);
        await this.recordUsage(request, model, usage, performance.now() - startedAt, "succeeded", attempt, undefined, undefined, response.id);
        return parsed;
      } catch (error) {
        await this.recordUsage(
          request,
          model,
          { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          performance.now() - startedAt,
          "failed",
          attempt,
          getErrorType(error),
          error instanceof Error ? error.message : String(error),
          requestId,
        );
        throw error;
      }
    });
  }

  async embed(request: EmbeddingRequest): Promise<number[][]> {
    if (request.inputs.length === 0) return [];
    const model = request.model ?? this.embeddingModel;
    const dimensions = request.dimensions ?? this.embeddingDimensions;
    const batches: string[][] = [];
    for (let index = 0; index < request.inputs.length; index += 128) {
      batches.push(request.inputs.slice(index, index + 128));
    }

    const embeddings: number[][] = [];
    for (const [batchIndex, inputs] of batches.entries()) {
      const result = await this.withRetries(request, model, async ({ signal, attempt }) => {
        const startedAt = performance.now();
        const requestId = crypto.randomUUID();
        try {
          const response = await this.client.embeddings.create(
            { model, input: inputs, dimensions, encoding_format: "float" },
            { signal },
          );
          const usage = usageFromResponse(response);
          await this.recordUsage(
            { ...request, metadata: { ...request.metadata, batchIndex, batchSize: inputs.length } },
            model,
            usage,
            performance.now() - startedAt,
            "succeeded",
            attempt,
            undefined,
            undefined,
            requestId,
          );
          return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
        } catch (error) {
          await this.recordUsage(
            { ...request, metadata: { ...request.metadata, batchIndex, batchSize: inputs.length } },
            model,
            { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            performance.now() - startedAt,
            "failed",
            attempt,
            getErrorType(error),
            error instanceof Error ? error.message : String(error),
            requestId,
          );
          throw error;
        }
      });
      embeddings.push(...result);
    }
    return embeddings;
  }

  async *streamText(request: TextGenerationRequest): AsyncGenerator<StreamTextEvent> {
    const model = request.model ?? this.chatModel;
    const startedAt = performance.now();
    const requestId = crypto.randomUUID();
    let attemptUsed = 1;
    let completedResponse: unknown;
    try {
      const stream = await this.withRetries(request, model, async ({ signal, attempt }) => {
        attemptUsed = attempt;
        return this.client.responses.create(
          {
            model,
            instructions: request.system,
            input: request.prompt,
            max_output_tokens: request.maxOutputTokens ?? 2_500,
            stream: true,
          },
          { signal },
        );
      });

      for await (const event of stream) {
        const record = event as unknown as Record<string, unknown>;
        if (record.type === "response.output_text.delta" && typeof record.delta === "string") {
          yield { type: "text-delta", delta: record.delta };
        }
        if (record.type === "response.completed" && record.response) {
          completedResponse = record.response;
        }
      }
      const usage = usageFromResponse(completedResponse);
      const responseRecord =
        completedResponse && typeof completedResponse === "object"
          ? (completedResponse as Record<string, unknown>)
          : {};
      const response: TextGenerationResult = {
        text: typeof responseRecord.output_text === "string" ? responseRecord.output_text : "",
        responseId: typeof responseRecord.id === "string" ? responseRecord.id : "",
        ...usage,
      };
      await this.recordUsage(request, model, usage, performance.now() - startedAt, "succeeded", attemptUsed, undefined, undefined, requestId);
      yield { type: "completed", response };
    } catch (error) {
      await this.recordUsage(
        request,
        model,
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        performance.now() - startedAt,
        "failed",
        attemptUsed,
        getErrorType(error),
        error instanceof Error ? error.message : String(error),
        requestId,
      );
      throw normalizeError(error, request.operation);
    }
  }

  private async withRetries<T>(
    request: OpenAIRequestContext,
    _model: string,
    operation: (context: AttemptContext) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      const { signal, dispose } = createCombinedSignal(this.timeoutMs, request.signal);
      try {
        return await operation({ signal, attempt });
      } catch (error) {
        lastError = error;
        if (request.signal?.aborted || !isRetryableOpenAIError(error) || attempt > this.maxRetries) break;
        const retryAfterMs = Math.min(4_000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
        await sleep(retryAfterMs);
      } finally {
        dispose();
      }
    }
    throw normalizeError(lastError, request.operation);
  }

  private async recordUsage(
    request: OpenAIRequestContext,
    model: string,
    usage: UsageNumbers,
    latencyMs: number,
    status: AIUsageEvent["status"],
    attempt: number,
    errorType?: string,
    errorMessage?: string,
    requestId = crypto.randomUUID(),
  ): Promise<void> {
    if (!this.usageHook) return;
    const event: AIUsageEvent = {
      organizationId: request.organizationId ?? this.defaultOrganizationId,
      model,
      operation: request.operation,
      userId: request.userId ?? this.defaultUserId,
      workflowId: request.workflowId,
      requestId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: estimateOpenAICost(model, usage.inputTokens, usage.outputTokens),
      latencyMs: Math.round(latencyMs),
      status,
      errorType,
      errorMessage,
      attempt,
      createdAt: new Date().toISOString(),
      metadata: request.metadata,
    };
    try {
      await this.usageHook(event);
    } catch (error) {
      console.error("AI usage logging failed", error);
    }
  }
}
