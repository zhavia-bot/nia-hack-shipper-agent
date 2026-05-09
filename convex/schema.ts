import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const bucketValidator = v.object({
  niche: v.string(),
  format: v.string(),
  priceTier: v.string(),
  channel: v.string(),
});

export default defineSchema({
  tenants: defineTable({
    subdomain: v.string(),
    hypothesisId: v.string(),
    experimentId: v.string(),
    generation: v.number(),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    deliverableKind: v.union(
      v.literal("pdf"),
      v.literal("json"),
      v.literal("md"),
      v.literal("zip")
    ),
    deliverableSpec: v.any(),
    deliverableStorageId: v.optional(v.string()),
    customDomain: v.optional(v.string()),
    status: v.union(
      v.literal("live"),
      v.literal("paused"),
      v.literal("killed")
    ),
    createdAt: v.number(),
  })
    .index("by_subdomain", ["subdomain"])
    .index("by_hypothesis", ["hypothesisId"])
    .index("by_status", ["status"]),

  experiments: defineTable({
    hypothesisId: v.string(),
    generation: v.number(),
    parentId: v.optional(v.string()),
    bucket: bucketValidator,
    spendUsd: v.number(),
    revenueUsd: v.number(),
    visitors: v.number(),
    conversions: v.number(),
    roasMean: v.optional(v.number()),
    roasLower: v.optional(v.number()),
    roasUpper: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("keep"),
      v.literal("refine"),
      v.literal("discard"),
      v.literal("crash")
    ),
    asyncFailure: v.optional(v.boolean()),
    disputed: v.optional(v.boolean()),
    refunded: v.optional(v.boolean()),
    startedAt: v.number(),
    decidedAt: v.optional(v.number()),
    notes: v.string(),
    rationale: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_generation", ["generation"])
    .index("by_bucket", ["bucket.niche", "bucket.format", "bucket.channel"]),

  ledgerEvents: defineTable({
    type: v.union(
      v.literal("charge"),
      v.literal("refund"),
      v.literal("ad_spend")
    ),
    amountUsd: v.number(),
    tenantId: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    stripeEventId: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    source: v.union(
      v.literal("stripe_webhook"),
      v.literal("google_ads_api"),
      v.literal("meta_ads_api"),
      v.literal("manual")
    ),
    timestamp: v.number(),
  })
    .index("by_stripe_event", ["stripeEventId"])
    .index("by_experiment", ["experimentId"])
    .index("by_timestamp", ["timestamp"]),

  lessons: defineTable({
    generation: v.number(),
    scope: v.union(
      v.object({
        kind: v.literal("bucket"),
        niche: v.string(),
        format: v.string(),
        priceTier: v.string(),
        channel: v.string(),
      }),
      v.object({ kind: v.literal("global") })
    ),
    pattern: v.string(),
    evidence: v.array(v.string()),
    weight: v.number(),
    createdAt: v.number(),
  }).index("by_generation", ["generation"]),

  /**
   * Singleton — exactly one row maintained by mutation logic. The agent
   * identity cannot mutate this table at all. Only `admin` and (for the
   * narrow killSwitchHalt=true update) `budget-watchdog` may write.
   */
  budgetState: defineTable({
    perExperimentUsd: v.number(),
    perGenerationUsd: v.number(),
    perDayUsd: v.number(),
    killSwitchHalt: v.boolean(),
    killSwitchReason: v.optional(v.string()),
    updatedAt: v.number(),
  }),

  budgetReservations: defineTable({
    experimentId: v.string(),
    generation: v.number(),
    reservedUsd: v.number(),
    spentUsd: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("finalized"),
      v.literal("released")
    ),
    reservedAt: v.number(),
    finalizedAt: v.optional(v.number()),
  })
    .index("by_experiment", ["experimentId"])
    .index("by_generation_status", ["generation", "status"])
    .index("by_status_time", ["status", "reservedAt"]),

  auditLog: defineTable({
    kind: v.string(),
    stripeEventId: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    payload: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_stripe_event", ["stripeEventId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_kind_time", ["kind", "timestamp"]),

  /** Singleton — current generation counter, run metadata. */
  systemState: defineTable({
    generation: v.number(),
    startedAt: v.number(),
    lastSnapshotAt: v.optional(v.number()),
    lastSnapshotGeneration: v.optional(v.number()),
  }),
});
