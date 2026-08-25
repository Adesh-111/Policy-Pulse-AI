import { z } from "zod";

export const EVALUATION_DATASET_VERSION = "1.0.0";
export const EVALUATION_METRIC_VERSION = "1.0.0";
export const EVALUATION_PROMPT_VERSION = "1.0.0";

export const EvaluationDatasetManifestSchema = z.object({
  datasetVersion: z.string().min(1),
  organization: z.string().min(1),
  description: z.string().min(1),
  questions: z.array(z.object({ id: z.string().regex(/^eval-\d{3,}$/) })).min(20),
});
