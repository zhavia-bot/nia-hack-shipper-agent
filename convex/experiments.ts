import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { requireUser } from "./users.js";

const bucketValidator = v.object({
  niche: v.string(),
  category: v.string(),
  priceTier: v.string(),
  channel: v.string(),
});

const experimentStatus = v.union(
  v.literal("pending"),
  v.literal("keep"),
  v.literal("refine"),
  v.literal("discard"),
  v.literal("crash")
);

export const create = mutation({
  args: {
    token: v.string(),
    actingUserId: v.id("users"),
    hypothesisId: v.string(),
    generation: v.number(),
    parentId: v.optional(v.string()),
    bucket: bucketValidator,
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    return ctx.db.insert("experiments", {
      userId: args.actingUserId,
      hypothesisId: args.hypothesisId,
      generation: args.generation,
      parentId: args.parentId,
      bucket: args.bucket,
      spendUsd: 0,
      revenueUsd: 0,
      visitors: 0,
      conversions: 0,
      status: "pending",
      startedAt: Date.now(),
      notes: "",
      rationale: args.rationale,
    });
  },
});

export const updateClassification = mutation({
  args: {
    token: v.string(),
    id: v.id("experiments"),
    status: experimentStatus,
    roasMean: v.optional(v.number()),
    roasLower: v.optional(v.number()),
    roasUpper: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    const patch: Record<string, unknown> = {
      status: args.status,
      decidedAt: Date.now(),
    };
    if (args.roasMean !== undefined) patch["roasMean"] = args.roasMean;
    if (args.roasLower !== undefined) patch["roasLower"] = args.roasLower;
    if (args.roasUpper !== undefined) patch["roasUpper"] = args.roasUpper;
    if (args.notes !== undefined) patch["notes"] = args.notes;
    await ctx.db.patch(args.id, patch);
  },
});

export const markCrashed = mutation({
  args: {
    token: v.string(),
    id: v.id("experiments"),
    error: v.string(),
  },
  handler: async (ctx, { token, id, error }) => {
    await requireIdentity(token, ["agent"]);
    await ctx.db.patch(id, {
      status: "crash",
      decidedAt: Date.now(),
      notes: `crash: ${error}`.slice(0, 1000),
    });
  },
});

export const recordVisit = mutation({
  args: { token: v.string(), id: v.id("experiments") },
  handler: async (ctx, { token, id }) => {
    await requireIdentity(token, ["agent", "stripe-webhook"]);
    const exp = await ctx.db.get(id);
    if (!exp) throw new Error("experiment not found");
    await ctx.db.patch(id, { visitors: exp.visitors + 1 });
  },
});

export const incrementSpend = mutation({
  args: {
    token: v.string(),
    id: v.id("experiments"),
    amountUsd: v.number(),
  },
  handler: async (ctx, { token, id, amountUsd }) => {
    await requireIdentity(token, ["agent"]);
    if (amountUsd < 0) throw new Error("amountUsd must be ≥0");
    const exp = await ctx.db.get(id);
    if (!exp) throw new Error("experiment not found");
    await ctx.db.patch(id, { spendUsd: exp.spendUsd + amountUsd });
  },
});

export const markAsyncFailure = mutation({
  args: { token: v.string(), id: v.id("experiments") },
  handler: async (ctx, { token, id }) => {
    await requireIdentity(token, ["stripe-webhook"]);
    await ctx.db.patch(id, { asyncFailure: true });
  },
});

export const markDisputed = mutation({
  args: { token: v.string(), id: v.id("experiments") },
  handler: async (ctx, { token, id }) => {
    await requireIdentity(token, ["stripe-webhook"]);
    await ctx.db.patch(id, { disputed: true, status: "discard" });
  },
});

export const markRefunded = mutation({
  args: { token: v.string(), id: v.id("experiments") },
  handler: async (ctx, { token, id }) => {
    await requireIdentity(token, ["refund-worker"]);
    await ctx.db.patch(id, { refunded: true });
  },
});

export const metrics = query({
  args: { token: v.string(), id: v.id("experiments") },
  handler: async (ctx, { token, id }) => {
    await requireIdentity(token, ["agent", "dashboard"]);
    return ctx.db.get(id);
  },
});

export const byStatus = query({
  args: {
    token: v.string(),
    status: experimentStatus,
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { token, status, actingUserId }) => {
    await requireIdentity(token, ["agent", "dashboard"]);
    if (actingUserId) {
      return ctx.db
        .query("experiments")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", actingUserId).eq("status", status),
        )
        .collect();
    }
    return ctx.db
      .query("experiments")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
  },
});

export const byGeneration = query({
  args: {
    token: v.string(),
    generation: v.number(),
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { token, generation, actingUserId }) => {
    await requireIdentity(token, ["agent", "dashboard"]);
    if (actingUserId) {
      return ctx.db
        .query("experiments")
        .withIndex("by_user_generation", (q) =>
          q.eq("userId", actingUserId).eq("generation", generation),
        )
        .collect();
    }
    return ctx.db
      .query("experiments")
      .withIndex("by_generation", (q) => q.eq("generation", generation))
      .collect();
  },
});

/** Human-side: list the current Clerk user's experiments for the console. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("experiments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

/**
 * Aggregate stats per bucket for Thompson sampling. Returns rows of
 * { bucket, alpha, beta, n } where alpha = 1 + total conversions and
 * beta = 1 + total non-conversions across all completed experiments
 * in that bucket.
 */
export const bucketStats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent"]);
    const all = await ctx.db.query("experiments").collect();
    const map = new Map<
      string,
      {
        bucket: { niche: string; category: string; priceTier: string; channel: string };
        conversions: number;
        nonConversions: number;
        n: number;
      }
    >();
    for (const e of all) {
      if (e.status === "pending" || e.status === "crash") continue;
      const key = `${e.bucket.niche}|${e.bucket.category}|${e.bucket.priceTier}|${e.bucket.channel}`;
      const cur = map.get(key) ?? {
        bucket: e.bucket,
        conversions: 0,
        nonConversions: 0,
        n: 0,
      };
      cur.conversions += e.conversions;
      cur.nonConversions += Math.max(0, e.visitors - e.conversions);
      cur.n += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((r) => ({
      bucket: r.bucket,
      alpha: 1 + r.conversions,
      beta: 1 + r.nonConversions,
      n: r.n,
    }));
  },
});
