import { z } from "zod";

export const NicheSchema = z.string().min(1).max(80);

export const FormatSchema = z.enum([
  "report",
  "critique",
  "pack",
  "directory",
  "audit",
  "generator",
]);
export type Format = z.infer<typeof FormatSchema>;

export const PriceTierSchema = z.enum(["1-5", "6-15", "16-30", "31-99"]);
export type PriceTier = z.infer<typeof PriceTierSchema>;

export const ChannelSchema = z.enum([
  "google_ads",
  "meta_ads",
  "x_organic",
  "reddit",
  "cold_email",
  "tiktok_organic",
  "owned_audience",
]);
export type Channel = z.infer<typeof ChannelSchema>;

export const BucketSchema = z.object({
  niche: NicheSchema,
  format: FormatSchema,
  priceTier: PriceTierSchema,
  channel: ChannelSchema,
});
export type Bucket = z.infer<typeof BucketSchema>;

export const DeliverableKindSchema = z.enum(["pdf", "json", "md", "zip"]);
export type DeliverableKind = z.infer<typeof DeliverableKindSchema>;
