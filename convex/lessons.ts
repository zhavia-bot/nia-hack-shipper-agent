import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

const lessonScope = v.union(
  v.object({
    kind: v.literal("bucket"),
    niche: v.string(),
    category: v.string(),
    priceTier: v.string(),
    channel: v.string(),
  }),
  v.object({ kind: v.literal("global") })
);

const DECAY_PER_GENERATION = 0.92;
const PRUNE_BELOW = 0.1;

export const write = mutation({
  args: {
    token: v.string(),
    lessons: v.array(
      v.object({
        generation: v.number(),
        scope: lessonScope,
        pattern: v.string(),
        evidence: v.array(v.string()),
        weight: v.number(),
      })
    ),
  },
  handler: async (ctx, { token, lessons }) => {
    await requireIdentity(token, ["agent"]);
    const now = Date.now();
    const ids: string[] = [];
    for (const l of lessons) {
      const id = await ctx.db.insert("lessons", { ...l, createdAt: now });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Top-N lessons by current weight. Used by `propose()` to ground each
 * hypothesis in prior findings. Runtime applies the time-decay before
 * picking; this query just orders.
 */
export const topWeighted = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireIdentity(token, ["agent"]);
    const all = await ctx.db.query("lessons").collect();
    return all
      .filter((l) => l.weight >= PRUNE_BELOW)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit ?? 50);
  },
});

/**
 * Apply time-decay to all lessons (multiply weight by 0.92) and prune
 * those that fall below 0.1. Called once per generation by the parent
 * loop after distillation. AutoResearchClaw pattern.
 */
export const decayAndPrune = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent"]);
    const all = await ctx.db.query("lessons").collect();
    let pruned = 0;
    for (const l of all) {
      const next = l.weight * DECAY_PER_GENERATION;
      if (next < PRUNE_BELOW) {
        await ctx.db.delete(l._id);
        pruned++;
      } else {
        await ctx.db.patch(l._id, { weight: next });
      }
    }
    return { pruned, kept: all.length - pruned };
  },
});

export const byGeneration = query({
  args: { token: v.string(), generation: v.number() },
  handler: async (ctx, { token, generation }) => {
    await requireIdentity(token, ["agent", "dashboard"]);
    return ctx.db
      .query("lessons")
      .withIndex("by_generation", (q) => q.eq("generation", generation))
      .collect();
  },
});
