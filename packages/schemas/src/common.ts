import { z } from "zod";

export const NicheSchema = z.string().min(1).max(80);

/**
 * Physical-product category for TikTok Shop hypothesis testing (P8.1).
 * The previous digital-format enum (report/critique/pack/...) is gone —
 * the agent now scouts physical SKUs on Temu / Alibaba / 1688 and ships
 * them as ad-creative-driven storefronts.
 */
export const PhysicalCategorySchema = z.enum([
  "kitchen",
  "beauty",
  "pet",
  "desk",
  "fitness",
  "home_decor",
  "tech_gadget",
  "fashion_accessory",
  "kids_toy",
  "outdoor",
]);
export type PhysicalCategory = z.infer<typeof PhysicalCategorySchema>;

export const PriceTierSchema = z.enum(["1-5", "6-15", "16-30", "31-99"]);
export type PriceTier = z.infer<typeof PriceTierSchema>;

/**
 * Single supported channel post-pivot. We only test on TikTok Shop;
 * influencer outreach lands through Reacher's sandboxed write endpoints.
 */
export const ChannelSchema = z.enum(["tiktok_shop"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const MarketplaceSchema = z.enum(["temu", "alibaba", "1688"]);
export type Marketplace = z.infer<typeof MarketplaceSchema>;

export const BucketSchema = z.object({
  niche: NicheSchema,
  category: PhysicalCategorySchema,
  priceTier: PriceTierSchema,
  channel: ChannelSchema,
});
export type Bucket = z.infer<typeof BucketSchema>;
