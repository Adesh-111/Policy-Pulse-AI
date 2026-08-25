import {
  EvaluationModeSchema,
  EvaluationQuestionSchema,
  EvaluationResultSchema,
  EvaluationRunOutputSchema,
  type EvaluationMode,
  type EvaluationQuestion,
  type EvaluationResult,
  type EvaluationRunOutput,
} from "./types";
import { averageMetrics, calculateEvaluationMetrics } from "./metrics";

export interface EvaluationModeAdapter {
  run(question: EvaluationQuestion, signal?: AbortSignal): Promise<EvaluationRunOutput>;
}

export interface EvaluationResultStore {
  save(result: EvaluationResult): Promise<void>;
}

export interface EvaluationRunSummary {
  results: EvaluationResult[];
  byMode: Record<EvaluationMode, ReturnType<typeof averageMetrics>>;
}

export class PolicyEvaluationRunner {
  constructor(
    private readonly adapters: Record<EvaluationMode, EvaluationModeAdapter>,
    private readonly store?: EvaluationResultStore,
  ) {}

  async run(
    rawQuestions: unknown[],
    modes: EvaluationMode[] = EvaluationModeSchema.options,
    signal?: AbortSignal,
  ): Promise<EvaluationRunSummary> {
    const questions = rawQuestions.map((question) => EvaluationQuestionSchema.parse(question));
    const results: EvaluationResult[] = [];
    for (const question of questions) {
      for (const rawMode of modes) {
        const mode = EvaluationModeSchema.parse(rawMode);
        try {
          const output = EvaluationRunOutputSchema.parse(await this.adapters[mode].run(question, signal));
          const result = EvaluationResultSchema.parse({
            questionId: question.id,
            mode,
            answer: output.answer,
            metrics: calculateEvaluationMetrics(question, output),
            citations: output.citations,
            createdAt: new Date().toISOString(),
            error: null,
          });
          results.push(result);
          await this.store?.save(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown evaluation failure";
          const result = EvaluationResultSchema.parse({
            questionId: question.id,
            mode,
            answer: "",
            metrics: calculateEvaluationMetrics(question, {
              answer: "",
              citations: [],
              retrievedEvidence: [],
              detectedChangeTypes: [],
              detectedConflictLabels: [],
              latencyMs: 0,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
            }),
            citations: [],
            createdAt: new Date().toISOString(),
            error: message,
          });
          results.push(result);
          await this.store?.save(result);
        }
      }
    }
    return {
      results,
      byMode: Object.fromEntries(
        EvaluationModeSchema.options.map((mode) => [
          mode,
          averageMetrics(results.filter((result) => result.mode === mode).map((result) => result.metrics)),
        ]),
      ) as EvaluationRunSummary["byMode"],
    };
  }
}
