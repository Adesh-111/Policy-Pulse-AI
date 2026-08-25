import { z, type ZodType } from "zod";

import type { OpenAIRequestContext } from "@/lib/openai";
import { OpenAIService } from "@/lib/openai";

import type { PolicyAgentDefinition } from "./agents";
import { buildUntrustedInputPrompt } from "./prompts";
import { CitationSchema, type Citation } from "./schemas";
import {
  AGENT_TOOL_NAMES,
  collectCitations,
  createInputBoundAgentTools,
  type AgentTool,
  type AgentToolExecutionContext,
  type AgentToolName,
  type AgentToolRegistry,
} from "./tools";

const AgentToolDecisionSchema = z.object({
  action: z.enum(["call_tool", "finish"]),
  toolName: z.enum(AGENT_TOOL_NAMES).nullable(),
  toolInputJson: z.string().min(2).max(20_000),
  decisionSummary: z.string().min(1).max(500),
});

const TOOL_INPUT_GUIDANCE: Record<AgentToolName, string> = {
  hybrid_policy_search:
    '{"query":"policy search query","documentIds":[],"versions":[],"limit":8}',
  citation_lookup: '{"chunkIds":["authorized chunk ID"]}',
  policy_rule_lookup: '{"ruleIds":["authorized rule ID"]}',
};

interface ExecutedToolResult {
  toolName: AgentToolName;
  input: unknown;
  output: unknown;
  attempts: number;
}

export interface AgentRunContext extends Omit<
  OpenAIRequestContext,
  "operation"
> {
  task?: string;
  tools?: AgentToolRegistry;
  maxToolCalls?: number;
}

function openAIContext(context: AgentRunContext) {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    workflowId: context.workflowId,
    signal: context.signal,
  };
}

function parseToolInputJson(value: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Agent tool input must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent tool input must be a JSON object");
  }
  return parsed;
}

async function executeReadOnlyTool(
  tool: AgentTool,
  rawInput: unknown,
  context: AgentToolExecutionContext,
  retryLimit: number,
): Promise<{ output: unknown; attempts: number }> {
  if (tool.readOnly !== true)
    throw new Error(`Agent tool ${tool.name} is not read-only`);
  const input = tool.inputSchema.parse(rawInput);
  const maximumAttempts = Math.max(1, Math.min(2, retryLimit));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (context.signal?.aborted) throw context.signal.reason;
    try {
      const output = tool.outputSchema.parse(
        await tool.execute(input, context),
      );
      return { output, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Agent tool ${tool.name} failed closed after ${maximumAttempts} attempts`,
    {
      cause: lastError,
    },
  );
}

function canonicalizeSupportedCitations<T>(
  result: T,
  authorizedData: unknown,
): T {
  const authorized = new Map(
    collectCitations(authorizedData).map((citation) => [
      citation.chunkId,
      citation,
    ]),
  );
  function visit(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value;
    const parsed = CitationSchema.safeParse(value);
    if (parsed.success) {
      const trusted = authorized.get(parsed.data.chunkId);
      if (!trusted || trusted.documentId !== parsed.data.documentId) {
        throw new Error(
          `Agent returned an unauthorized or altered citation: ${parsed.data.chunkId}`,
        );
      }
      // The model only selects an authorized chunk. All display metadata and
      // quoted evidence come from the trusted retrieval result, never from the
      // generated response.
      return trusted;
    }
    if (Array.isArray(value)) return value.map(visit);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        visit(item),
      ]),
    );
  }
  return visit(result) as T;
}

function recordActualToolTrace<T>(
  result: T,
  executed: ExecutedToolResult[],
): T {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return result;
  const record = result as Record<string, unknown>;
  if (
    !record.trace ||
    typeof record.trace !== "object" ||
    Array.isArray(record.trace)
  )
    return result;
  const toolNames = [...new Set(executed.map((item) => item.toolName))];
  const evidenceFound = new Set(
    executed.flatMap((item) =>
      collectCitations(item.output).map((citation) => citation.chunkId),
    ),
  ).size;
  return {
    ...record,
    trace: {
      ...(record.trace as Record<string, unknown>),
      toolUsed: toolNames.length ? toolNames.join(", ") : "none",
      evidenceFound,
    },
  } as T;
}

export async function runPolicyAgent<
  TInput extends ZodType,
  TOutput extends ZodType,
>(
  openAI: OpenAIService,
  definition: PolicyAgentDefinition<TInput, TOutput>,
  rawInput: unknown,
  context: AgentRunContext = {},
): Promise<z.infer<TOutput>> {
  const input = definition.inputSchema.parse(rawInput);
  const task = context.task ?? definition.goal;
  const tools: AgentToolRegistry = {
    ...context.tools,
    ...createInputBoundAgentTools(input),
  };
  const allowedTools = new Map(
    definition.tools.flatMap((descriptor) => {
      const tool = tools[descriptor.name];
      return tool ? [[descriptor.name, tool] as const] : [];
    }),
  );
  const maximumToolCalls = Math.max(0, Math.min(3, context.maxToolCalls ?? 3));
  const executed: ExecutedToolResult[] = [];
  const callSignatures = new Set<string>();

  for (
    let step = 0;
    step < maximumToolCalls && allowedTools.size > 0;
    step += 1
  ) {
    const decision = await openAI.generateObject({
      operation: `agent.${definition.name}.tool_decision`,
      system: `${definition.systemInstruction}\nYou operate a bounded read-only tool loop. Choose at most one available tool for this step or finish. Never request a tool outside the supplied list. Encode the selected tool's arguments as one JSON object in toolInputJson; use {} when finishing. Do not provide hidden reasoning; decisionSummary must be a concise action justification.`,
      prompt: buildUntrustedInputPrompt(
        "Decide whether one read-only tool call is needed before producing the final structured result.",
        {
          task,
          input,
          availableTools: definition.tools
            .filter((descriptor) => allowedTools.has(descriptor.name))
            .map(({ name, purpose, readOnly }) => ({
              name,
              purpose,
              readOnly,
              toolInputJsonExample: TOOL_INPUT_GUIDANCE[name],
            })),
          priorToolResults: executed,
          remainingToolCalls: maximumToolCalls - step,
        },
      ),
      schema: AgentToolDecisionSchema,
      schemaName: `${definition.name}_tool_decision`,
      maxOutputTokens: 600,
      ...openAIContext(context),
      metadata: {
        ...context.metadata,
        agent: definition.name,
        phase: "tool_decision",
        toolStep: step + 1,
      },
    });
    if (decision.action === "finish") break;
    if (!decision.toolName)
      throw new Error("Agent requested a tool call without a tool name");
    const tool = allowedTools.get(decision.toolName);
    if (!tool)
      throw new Error(`Agent requested unavailable tool: ${decision.toolName}`);
    const parsedToolInput = tool.inputSchema.parse(
      parseToolInputJson(decision.toolInputJson),
    );
    const signature = `${decision.toolName}:${JSON.stringify(parsedToolInput)}`;
    if (callSignatures.has(signature)) {
      throw new Error(
        `Agent attempted a repeated tool call: ${decision.toolName}`,
      );
    }
    callSignatures.add(signature);
    const execution = await executeReadOnlyTool(
      tool,
      parsedToolInput,
      openAIContext(context),
      definition.retryLimit,
    );
    executed.push({
      toolName: decision.toolName,
      input: parsedToolInput,
      output: execution.output,
      attempts: execution.attempts,
    });
  }

  const generated = await openAI.generateObject({
    operation: `agent.${definition.name}`,
    system: definition.systemInstruction,
    prompt: buildUntrustedInputPrompt(
      `${task} Use only the supplied input and executed tool results. Never claim an unexecuted tool was used.`,
      { input, executedToolResults: executed },
    ),
    schema: definition.outputSchema,
    schemaName: `${definition.name}_output`,
    maxOutputTokens: 4_500,
    ...openAIContext(context),
    metadata: {
      ...context.metadata,
      agent: definition.name,
      retryLimit: definition.retryLimit,
      phase: "final",
      executedTools: executed.map((item) => item.toolName),
    },
  });
  const canonical = canonicalizeSupportedCitations(generated, {
    input,
    executed,
  });
  const normalized = recordActualToolTrace(canonical, executed);
  const validated = definition.outputSchema.parse(normalized);
  return validated;
}
