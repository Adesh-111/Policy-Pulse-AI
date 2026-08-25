import type OpenAI from "openai";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { OpenAIService } from "@/lib/openai";

describe("tracked OpenAI client with mocked SDK", () => {
  it("uses Responses structured outputs and embeddings without network requests", async () => {
    const usageHook = vi.fn();
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: "resp-text",
          output_text: "Grounded response",
          usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
        }),
        parse: vi.fn().mockResolvedValue({
          id: "resp-object",
          output_parsed: { passed: true, score: 0.9 },
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        }),
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
      },
    } as unknown as OpenAI;
    const service = new OpenAIService({
      client,
      usageHook,
      defaultOrganizationId: "11111111-1111-4111-8111-111111111111",
      maxRetries: 0,
    });

    await expect(
      service.generateText({ operation: "test.text", system: "System", prompt: "Question" }),
    ).resolves.toMatchObject({ text: "Grounded response", totalTokens: 16 });
    await expect(
      service.generateObject({
        operation: "test.structured",
        system: "System",
        prompt: "Review",
        schema: z.object({ passed: z.boolean(), score: z.number() }),
        schemaName: "quality_review",
      }),
    ).resolves.toEqual({ passed: true, score: 0.9 });
    await expect(
      service.embed({ operation: "test.embedding", inputs: ["Policy text"], dimensions: 3 }),
    ).resolves.toEqual([[0.1, 0.2, 0.3]]);
    expect(client.responses.create).toHaveBeenCalledOnce();
    expect(client.responses.parse).toHaveBeenCalledOnce();
    expect(client.embeddings.create).toHaveBeenCalledOnce();
    expect(usageHook).toHaveBeenCalledTimes(3);
  });
});
