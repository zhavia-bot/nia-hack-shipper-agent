import { z } from "zod";
import { BucketSchema } from "./common.js";

export const ExperimentStatusSchema = z.enum([
  "pending",
  "keep",
  "refine",
  "discard",
  "crash",
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const ExperimentSchema = z.object({
  id: z.string(),
  hypothesisId: z.string(),
  generation: z.number().int().nonnegative(),
  parentId: z.string().nullable().optional(),
  bucket: BucketSchema,
  spendUsd: z.number().nonnegative(),
  revenueUsd: z.number().nonnegative(),
  visitors: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  roasMean: z.number().nullable().optional(),
  roasLower: z.number().nullable().optional(),
  roasUpper: z.number().nullable().optional(),
  status: ExperimentStatusSchema,
  asyncFailure: z.boolean().optional(),
  startedAt: z.number().int(),
  decidedAt: z.number().int().nullable().optional(),
  notes: z.string(),
  rationale: z.string(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;
