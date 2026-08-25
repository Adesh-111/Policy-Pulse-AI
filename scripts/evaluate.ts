import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const EvaluationDatasetSchema = z.object({
  datasetVersion: z.string().min(1),
  organization: z.string().min(1),
  description: z.string().min(1),
  questions: z
    .array(
      z.object({
        id: z.string().regex(/^eval-\d{3,}$/),
        category: z.string().min(1),
        difficulty: z.enum(["easy", "medium", "hard"]),
        question: z.string().min(5),
        expectedAnswer: z.string().min(1),
        expectedFacts: z.array(z.string()),
        expectedChangeTypes: z.array(z.string()),
        expectedRisk: z.enum(["low", "medium", "high", "critical"]).nullable(),
        relevantPolicies: z
          .array(
            z.object({
              file: z.string().min(1),
              version: z.string().min(1),
              section: z.string().min(1),
            }),
          )
          .default([]),
        mustCite: z.boolean(),
      }),
    )
    .min(20),
});

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const datasetPath = resolve(process.cwd(), "evaluation/questions.json");
  const dataset = EvaluationDatasetSchema.parse(
    JSON.parse(await readFile(datasetPath, "utf8")) as unknown,
  );
  const categories = Object.fromEntries(
    [...new Set(dataset.questions.map((question) => question.category))].map((category) => [
      category,
      dataset.questions.filter((question) => question.category === category).length,
    ]),
  );
  console.log(
    JSON.stringify(
      {
        valid: true,
        datasetVersion: dataset.datasetVersion,
        questions: dataset.questions.length,
        categories,
      },
      null,
      2,
    ),
  );

  if (!process.argv.includes("--enqueue")) return;
  const organizationId = argument("--organization") ?? process.env.EVALUATION_ORGANIZATION_ID;
  const requestedBy = argument("--requested-by") ?? process.env.EVALUATION_REQUESTED_BY;
  if (!z.uuid().safeParse(organizationId).success || !z.uuid().safeParse(requestedBy).success) {
    throw new Error(
      "--enqueue requires UUID values for --organization and --requested-by (or EVALUATION_ORGANIZATION_ID and EVALUATION_REQUESTED_BY).",
    );
  }
  const runId = randomUUID();
  const runLabel = `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("--enqueue requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: job, error } = await supabase
    .from("background_jobs")
    .insert({
      organization_id: organizationId,
      job_type: "run_evaluation",
      subject_type: "evaluation_run",
      subject_id: runId,
      idempotency_key: `evaluation:${runId}`,
      payload: {
        run_id: runId,
        run_label: runLabel,
        requested_by: requestedBy,
        variants: [
          "openai_without_rag",
          "openai_with_rag",
          "rag_agents_reflection",
        ],
        question_ids: [],
        cursor: 0,
      },
      max_attempts: 3,
      status: "queued",
      next_attempt_at: new Date().toISOString(),
    })
    .select("id,status")
    .single();
  if (error) throw new Error(`Unable to queue evaluation: ${error.message}`);
  console.log(JSON.stringify({ enqueued: true, runId, runLabel, job }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
