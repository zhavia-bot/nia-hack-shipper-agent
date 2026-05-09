import { z } from "zod";
import { ProductSourceSchema } from "./hypothesis.js";

export const TenantStatusSchema = z.enum(["live", "paused", "killed"]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  subdomain: z.string().min(1).max(63),
  hypothesisId: z.string(),
  experimentId: z.string(),
  generation: z.number().int().nonnegative(),
  stripeProductId: z.string(),
  stripePriceId: z.string(),
  // P8.1: physical-products pivot — replaces deliverableKind/deliverableSpec.
  productSource: ProductSourceSchema,
  adCreativeStorageIds: z.array(z.string()).max(5),
  customDomain: z.string().nullable().optional(),
  status: TenantStatusSchema,
  createdAt: z.number().int(),
});
export type Tenant = z.infer<typeof TenantSchema>;
