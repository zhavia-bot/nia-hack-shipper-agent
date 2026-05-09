import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const bucketValidator = v.object({
  niche: v.string(),
  category: v.string(),
  priceTier: v.string(),
  channel: v.string(),
});

const productSourceValidator = v.object({
  marketplace: v.string(),
  url: v.string(),
  originalTitle: v.string(),
  originalPriceUsd: v.number(),
  scrapedImageStorageIds: v.array(v.string()),
});

export default defineSchema({
  /**
   * Human users (Clerk-authenticated). Service identities (agent,
   * stripe-webhook, etc.) are NOT users — they're caller-identity JWTs
   * verified by `_lib/identity.ts`.
   *
   * Provisioned lazily by the Clerk webhook (`http.ts` /clerk-webhook).
   * Every user-scoped mutation downstream looks up by `tokenIdentifier`
   * (`${issuer}|${subject}`) — see `_lib/user.ts::requireUser`.
   *
   * BYOK keys are stored plaintext per hackathon scope. Production must
   * encrypt at rest with a KMS-backed master key.
   */
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    // BYOK API keys — plaintext, hackathon-grade. See P3 + P7.2 + P7.4.
    // aiGatewayKey routes all LLM + image gen via Vercel AI Gateway. There
    // is no separate OpenAI / fal key — the Gateway covers both.
    aiGatewayKey: v.optional(v.string()),
    exaKey: v.optional(v.string()),
    resendKey: v.optional(v.string()),
    reacherKey: v.optional(v.string()),
    niaKey: v.optional(v.string()),
    // Stripe Connect — see P4.
    stripeConnectedAccountId: v.optional(v.string()),
    stripeCountry: v.optional(v.string()),
    stripeChargesEnabled: v.optional(v.boolean()),
    stripePayoutsEnabled: v.optional(v.boolean()),
    stripeRequirementsCurrentlyDue: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_stripe_account", ["stripeConnectedAccountId"]),

  tenants: defineTable({
    userId: v.id("users"),
    subdomain: v.string(),
    hypothesisId: v.string(),
    experimentId: v.string(),
    generation: v.number(),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    // P8.1: physical-products pivot. The agent now scouts a real SKU on
    // Temu/Alibaba/1688 and ships it as ad-creative-driven storefront.
    productSource: productSourceValidator,
    adCreativeStorageIds: v.array(v.string()),
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
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  experiments: defineTable({
    userId: v.id("users"),
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
    .index("by_bucket", ["bucket.niche", "bucket.category", "bucket.channel"])
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_generation", ["userId", "generation"]),

  ledgerEvents: defineTable({
    userId: v.id("users"),
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
    .index("by_timestamp", ["timestamp"])
    .index("by_user", ["userId"])
    .index("by_user_time", ["userId", "timestamp"]),

  lessons: defineTable({
    generation: v.number(),
    scope: v.union(
      v.object({
        kind: v.literal("bucket"),
        niche: v.string(),
        category: v.string(),
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
