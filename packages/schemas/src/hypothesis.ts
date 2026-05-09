import { z } from "zod";
import { BucketSchema, DeliverableKindSchema } from "./common.js";

export const CopySchema = z.object({
  headline: z.string().max(80),
  subhead: z.string().max(200),
  bullets: z.array(z.string().max(120)).max(5),
  cta: z.string().max(40),
});
export type Copy = z.infer<typeof CopySchema>;

export const DeliverableSchema = z.object({
  kind: DeliverableKindSchema,
  spec: z.unknown(),
});
export type Deliverable = z.infer<typeof DeliverableSchema>;

export const TrafficPlanSchema = z.object({
  channel: z.string(),
  budgetUsd: z.number().min(0).max(20),
});
export type TrafficPlan = z.infer<typeof TrafficPlanSchema>;

export const HypothesisSchema = z.object({
  id: z.string(),
  generation: z.number().int().nonnegative(),
  parentId: z.string().nullable(),
  bucket: BucketSchema,
  copy: CopySchema,
  price: z.number().int().min(1).max(99),
  deliverable: DeliverableSchema,
  trafficPlan: TrafficPlanSchema,
  rationale: z.string().min(1).max(500),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;
