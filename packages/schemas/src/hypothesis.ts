import { z } from "zod";
import { BucketSchema, MarketplaceSchema } from "./common.js";

export const CopySchema = z.object({
  headline: z.string().max(80),
  subhead: z.string().max(200),
  bullets: z.array(z.string().max(120)).max(5),
  cta: z.string().max(40),
});
export type Copy = z.infer<typeof CopySchema>;

/**
 * Source product scouted on a Chinese marketplace (P8.6 fills this in).
 * `scrapedImageStorageIds` are Convex File Storage IDs for the original
 * product photos; AI Gateway re-skins them into ad creatives in P8.8.
 */
export const ProductSourceSchema = z.object({
  marketplace: MarketplaceSchema,
  url: z.string().url(),
  originalTitle: z.string().min(1).max(300),
  originalPriceUsd: z.number().min(0).max(1000),
  scrapedImageStorageIds: z.array(z.string()).max(10),
});
export type ProductSource = z.infer<typeof ProductSourceSchema>;

export const TrafficPlanSchema = z.object({
  channel: z.string(),
  budgetUsd: z.number().min(0).max(20),
});
export type TrafficPlan = z.infer<typeof TrafficPlanSchema>;

export const HypothesisSchema = z.object({
  id: z.string(),
  // Convex Id<"users"> for the human whose BYOK keys + Stripe Connect
  // account this run uses. Required since the multi-tenant pivot.
  actingUserId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  parentId: z.string().nullable(),
  bucket: BucketSchema,
  copy: CopySchema,
  // Listed retail price the storefront charges (USD, integer cents-resolution).
  price: z.number().int().min(1).max(99),
  // Set after the scout step (P8.6); null at proposal time.
  productSource: ProductSourceSchema.nullable(),
  // Set after the image-gen step (P8.8); empty until then.
  adCreativeStorageIds: z.array(z.string()).max(5),
  trafficPlan: TrafficPlanSchema,
  rationale: z.string().min(1).max(500),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;
