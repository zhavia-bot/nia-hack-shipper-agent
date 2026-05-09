/**
 * IMMUTABLE — the agent must never edit this file. Karpathy `prepare.py`
 * analog. CODEOWNERS gates changes.
 *
 * Revenue recognition rules (P0 #5 fix from `docs/stack.md` §4.4.3):
 *   - `recordCharge` accepts only paymentStatus === "paid".
 *   - Caller identity must be `stripe-webhook` for charges, `refund-worker`
 *     or `stripe-webhook` for refunds, `agent` for ad_spend.
 *   - Idempotent on `stripeEventId` — replays return the existing row.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { findByStripeEvent } from "./_lib/idempotent.js";

export const recordCharge = mutation({
  args: {
    token: v.string(),
    stripeEventId: v.string(),
    amountUsd: v.number(),
    experimentId: v.string(),
    tenantSubdomain: v.optional(v.string()),
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

    const id = await ctx.db.insert("ledgerEvents", {
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

    return ctx.db.insert("ledgerEvents", {
      type: "refund",
      amountUsd: -Math.abs(args.amountUsd),
      stripeEventId: args.stripeEventId,
      source: "stripe_webhook",
      timestamp: Date.now(),
    });
  },
});

export const recordAdSpend = mutation({
  args: {
    token: v.string(),
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

/** Net cumulative dollars: charges + refunds + ad_spend (signed). */
export const totalNet = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    const events = await ctx.db.query("ledgerEvents").collect();
    let net = 0;
    for (const e of events) net += e.amountUsd;
    return net;
  },
});

export const recentEvents = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    return ctx.db
      .query("ledgerEvents")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit ?? 50);
  },
});
