import { describe, expect, it } from "vitest";

import { estimateOpenAICost } from "@/lib/openai";

describe("OpenAI usage estimation", () => {
  it("estimates chat and embedding costs from recorded tokens", () => {
    expect(estimateOpenAICost("gpt-4.1-mini", 1_000_000, 500_000)).toBe(1.2);
    expect(estimateOpenAICost("text-embedding-3-small", 1_000_000, 0)).toBe(0.02);
  });

  it("accepts deployment-specific price overrides", () => {
    expect(
      estimateOpenAICost("custom-model", 1_000_000, 1_000_000, {
        "custom-model": { input: 3, output: 9 },
      }),
    ).toBe(12);
  });
});
