/**
 * IMMUTABLE — the agent must never edit this file. Karpathy `prepare.py`
 * analog. CODEOWNERS gates changes.
 *
 * Revenue recognition rules (P0 #5 fix from `docs/stack.md` §4.4.3):
 *   - `recordCharge` accepts only paymentStatus === "paid".
 *   - Caller identity must be `stripe-webhook` for charges, `refund-worker`
 *     or `stripe-webhook` for refunds, `agent` for ad_spend.
 *   - Idempotent on `stripeEventId` — replays return the existing row.
 *
 * Multi-tenant: every ledger row carries `userId`. Service callers don't
 * pass it — we derive it from the linked tenant (charge) or experiment
 * (ad_spend, refund). Refunds without a tenant context will fail; the
 * caller must include `tenantSubdomain` so we can resolve.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { findByStripeEvent } from "./_lib/idempotent.js";
import { requireUser } from "./users.js";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";

async function userIdForSubdomain(
  ctx: MutationCtx,
  subdomain: string,
): Promise<Id<"users">> {
  const tenant = await ctx.db
    .query("tenants")
    .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
    .unique();
  if (!tenant) throw new Error(`tenant not found: ${subdomain}`);
  return tenant.userId;
}

export const recordCharge = mutation({
  args: {
    token: v.string(),
    stripeEventId: v.string(),
    amountUsd: v.number(),
    experimentId: v.string(),
    tenantSubdomain: v.string(),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["stripe-webhook"]);

    if (args.paymentStatus !== "paid") {
      throw new Error(
        `recordCharge rejected: paymentStatus must be "paid" (got "${args.paymentStatus}")`
      );
    }
    if (args.amountUsd <= 0) {
      throw new Error("recordCharge rejected: amountUsd must be > 0");
    }

    const existing = await findByStripeEvent(
      ctx,
      "ledgerEvents",
      args.stripeEventId
    );
    if (existing) return existing._id;

    const userId = await userIdForSubdomain(ctx, args.tenantSubdomain);

    const id = await ctx.db.insert("ledgerEvents", {
      userId,
      type: "charge",
      amountUsd: args.amountUsd,
      tenantId: args.tenantSubdomain,
      experimentId: args.experimentId,
      stripeEventId: args.stripeEventId,
      paymentStatus: args.paymentStatus,
      source: "stripe_webhook",
      timestamp: Date.now(),
    });

    // Mirror revenue onto the experiment for fast reads.
    const exp = await ctx.db
      .query("experiments")
      .filter((q) => q.eq(q.field("_id"), args.experimentId))
      .first();
    if (exp) {
      await ctx.db.patch(exp._id, {
        revenueUsd: exp.revenueUsd + args.amountUsd,
        conversions: exp.conversions + 1,
      });
    }

    return id;
  },
});

export const recordRefund = mutation({
  args: {
    token: v.string(),
    stripeEventId: v.string(),
    amountUsd: v.number(),
    chargeId: v.string(),
    tenantSubdomain: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["stripe-webhook", "refund-worker"]);
    if (args.amountUsd <= 0) {
      throw new Error("recordRefund rejected: amountUsd must be > 0");
    }

    const existing = await findByStripeEvent(
      ctx,
      "ledgerEvents",
      args.stripeEventId
    );
    if (existing) return existing._id;

    const userId = await userIdForSubdomain(ctx, args.tenantSubdomain);

    return ctx.db.insert("ledgerEvents", {
      userId,
      type: "refund",
      amountUsd: -Math.abs(args.amountUsd),
      tenantId: args.tenantSubdomain,
      stripeEventId: args.stripeEventId,
      source: "stripe_webhook",
      timestamp: Date.now(),
    });
  },
});

export const recordAdSpend = mutation({
  args: {
    token: v.string(),
    actingUserId: v.id("users"),
    experimentId: v.string(),
    amountUsd: v.number(),
    source: v.union(
      v.literal("google_ads_api"),
      v.literal("meta_ads_api"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    if (args.amountUsd <= 0) {
      throw new Error("recordAdSpend rejected: amountUsd must be > 0");
    }
    return ctx.db.insert("ledgerEvents", {
      userId: args.actingUserId,
      type: "ad_spend",
      amountUsd: -Math.abs(args.amountUsd),
      experimentId: args.experimentId,
      source: args.source,
      timestamp: Date.now(),
    });
  },
});

export const byExperiment = query({
  args: { token: v.string(), experimentId: v.string() },
  handler: async (ctx, { token, experimentId }) => {
    await requireIdentity(token, ["agent", "dashboard"]);
    return ctx.db
      .query("ledgerEvents")
      .withIndex("by_experiment", (q) => q.eq("experimentId", experimentId))
      .collect();
  },
});

/** Net cumulative dollars: charges + refunds + ad_spend (signed). Service callers. */
export const totalNet = query({
  args: { token: v.string(), actingUserId: v.optional(v.id("users")) },
  handler: async (ctx, { token, actingUserId }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    const events = actingUserId
      ? await ctx.db
          .query("ledgerEvents")
          .withIndex("by_user", (q) => q.eq("userId", actingUserId))
          .collect()
      : await ctx.db.query("ledgerEvents").collect();
    let net = 0;
    for (const e of events) net += e.amountUsd;
    return net;
  },
});

export const recentEvents = query({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { token, limit, actingUserId }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    const take = limit ?? 50;
    if (actingUserId) {
      return ctx.db
        .query("ledgerEvents")
        .withIndex("by_user_time", (q) => q.eq("userId", actingUserId))
        .order("desc")
        .take(take);
    }
    return ctx.db
      .query("ledgerEvents")
      .withIndex("by_timestamp")
      .order("desc")
      .take(take);
  },
});

/** Human-side: ledger for the current Clerk user. */
export const mineNet = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const events = await ctx.db
      .query("ledgerEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let charges = 0;
    let refunds = 0;
    let adSpend = 0;
    for (const e of events) {
      if (e.type === "charge") charges += e.amountUsd;
      else if (e.type === "refund") refunds += e.amountUsd;
      else if (e.type === "ad_spend") adSpend += e.amountUsd;
    }
    return {
      net: charges + refunds + adSpend,
      charges,
      refunds,
      adSpend,
      eventCount: events.length,
      asOf: Date.now(),
    };
  },
});

export const mineRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("ledgerEvents")
      .withIndex("by_user_time", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit ?? 50);
  },
});
