import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { findByStripeEvent } from "./_lib/idempotent.js";

/**
 * Audit log is append-only with idempotency on `stripeEventId`. Multiple
 * identities can write — `stripe-webhook` for non-paid completions and
 * dispute records, `agent` for tool-call traces, `admin` for kill-switch
 * actions.
 */
export const record = mutation({
  args: {
    token: v.string(),
    kind: v.string(),
    stripeEventId: v.optional(v.string()),
    experimentId: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, [
      "stripe-webhook",
      "agent",
      "admin",
      "refund-worker",
      "budget-watchdog",
    ]);

    if (args.stripeEventId) {
      const existing = await findByStripeEvent(
        ctx,
        "auditLog",
        args.stripeEventId
      );
      if (existing) return existing._id;
    }

    return ctx.db.insert("auditLog", {
      kind: args.kind,
      stripeEventId: args.stripeEventId,
      experimentId: args.experimentId,
      paymentStatus: args.paymentStatus,
      payload: args.payload,
      timestamp: Date.now(),
    });
  },
});

export const recent = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    return ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit ?? 100);
  },
});

export const byKind = query({
  args: { token: v.string(), kind: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, kind, limit }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    return ctx.db
      .query("auditLog")
      .withIndex("by_kind_time", (q) => q.eq("kind", kind))
      .order("desc")
      .take(limit ?? 100);
  },
});
