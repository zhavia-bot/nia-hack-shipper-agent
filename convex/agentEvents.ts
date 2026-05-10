import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { requireUser } from "./users.js";

const levelValidator = v.union(
  v.literal("info"),
  v.literal("ok"),
  v.literal("warn"),
  v.literal("error"),
);

/**
 * Agent-side: append a high-level activity row. Every workflow step
 * that wants to surface something to the operator dashboard calls
 * this. Token-gated so neither dashboards nor storefronts can
 * fabricate events; only the agent (or admin tooling) can write.
 *
 * `userId` is required and explicit — the agent identity is
 * multi-tenant, and we do not infer ownership from anything else.
 */
export const record = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    level: levelValidator,
    kind: v.string(),
    summary: v.string(),
    generation: v.optional(v.number()),
    experimentId: v.optional(v.string()),
    hypothesisId: v.optional(v.string()),
    tenantSubdomain: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent", "admin"]);
    return ctx.db.insert("agentEvents", {
      userId: args.userId,
      level: args.level,
      kind: args.kind,
      summary: args.summary,
      generation: args.generation,
      experimentId: args.experimentId,
      hypothesisId: args.hypothesisId,
      tenantSubdomain: args.tenantSubdomain,
      payload: args.payload,
      timestamp: Date.now(),
    });
  },
});

/**
 * Human-side: tail of the current user's stream. Convex pushes the
 * `useQuery` subscription so this is a live feed without polling.
 */
export const recentForCurrentUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("agentEvents")
      .withIndex("by_user_time", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

/**
 * Human-side: tail filtered to a single experiment, for the
 * experiment-detail page. We use `by_user_experiment` so a malicious
 * experimentId can't surface another tenant's rows.
 */
export const recentForExperiment = query({
  args: { experimentId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { experimentId, limit }) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("agentEvents")
      .withIndex("by_user_experiment", (q) =>
        q.eq("userId", user._id).eq("experimentId", experimentId),
      )
      .order("desc")
      .take(Math.min(limit ?? 100, 200));
  },
});
