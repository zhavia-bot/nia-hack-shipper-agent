import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

async function ensureSystemState(ctx: { db: any }) {
  const cur = await ctx.db.query("systemState").first();
  if (cur) return cur;
  const id = await ctx.db.insert("systemState", {
    generation: 0,
    startedAt: Date.now(),
  });
  return ctx.db.get(id);
}

/**
 * Increment and return the new generation number. Singleton. Called once
 * per parent-loop iteration before fan-out.
 */
export const nextGeneration = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent"]);
    const state = await ensureSystemState(ctx);
    if (!state) throw new Error("systemState missing");
    const nextGen = state.generation + 1;
    await ctx.db.patch(state._id, { generation: nextGen });
    return nextGen;
  },
});

export const currentGeneration = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    const cur = await ctx.db.query("systemState").first();
    return cur?.generation ?? 0;
  },
});

export const snapshotGeneration = mutation({
  args: { token: v.string(), generation: v.number() },
  handler: async (ctx, { token, generation }) => {
    await requireIdentity(token, ["agent"]);
    const state = await ensureSystemState(ctx);
    if (!state) throw new Error("systemState missing");
    await ctx.db.patch(state._id, {
      lastSnapshotAt: Date.now(),
      lastSnapshotGeneration: generation,
    });
  },
});

/**
 * Returns the current kill-switch state. Parent loop polls this with a
 * short sleep when halted, instead of blocking inside a mutation. Convex
 * mutations are short-lived; long-poll waits are not the right primitive.
 */
export const killSwitchState = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    const cur = await ctx.db.query("budgetState").first();
    return {
      halt: cur?.killSwitchHalt ?? false,
      reason: cur?.killSwitchReason ?? null,
    };
  },
});
