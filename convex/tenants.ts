import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

const tenantStatus = v.union(
  v.literal("live"),
  v.literal("paused"),
  v.literal("killed")
);

const deliverableKind = v.union(
  v.literal("pdf"),
  v.literal("json"),
  v.literal("md"),
  v.literal("zip")
);

export const create = mutation({
  args: {
    token: v.string(),
    subdomain: v.string(),
    hypothesisId: v.string(),
    experimentId: v.string(),
    generation: v.number(),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    deliverableKind,
    deliverableSpec: v.any(),
    deliverableStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);

    const existing = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain))
      .first();
    if (existing) {
      throw new Error(`tenant already exists for subdomain: ${args.subdomain}`);
    }

    return ctx.db.insert("tenants", {
      subdomain: args.subdomain,
      hypothesisId: args.hypothesisId,
      experimentId: args.experimentId,
      generation: args.generation,
      stripeProductId: args.stripeProductId,
      stripePriceId: args.stripePriceId,
      deliverableKind: args.deliverableKind,
      deliverableSpec: args.deliverableSpec,
      deliverableStorageId: args.deliverableStorageId,
      status: "live",
      createdAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    subdomain: v.string(),
    status: tenantStatus,
  },
  handler: async (ctx, { token, subdomain, status }) => {
    await requireIdentity(token, ["agent", "admin"]);
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .unique();
    if (!tenant) throw new Error(`tenant not found: ${subdomain}`);
    await ctx.db.patch(tenant._id, { status });
  },
});

export const setCustomDomain = mutation({
  args: {
    token: v.string(),
    subdomain: v.string(),
    customDomain: v.string(),
  },
  handler: async (ctx, { token, subdomain, customDomain }) => {
    await requireIdentity(token, ["agent"]);
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .unique();
    if (!tenant) throw new Error(`tenant not found: ${subdomain}`);
    await ctx.db.patch(tenant._id, { customDomain });
  },
});

/**
 * Public — used by the storefront page render. No identity check; tenant
 * data is intentionally public on the storefront surface. Returns null
 * for unknown subdomains so the page can `notFound()`.
 */
export const bySubdomain = query({
  args: { subdomain: v.string() },
  handler: async (ctx, { subdomain }) => {
    return ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .first();
  },
});

export const byStatus = query({
  args: {
    token: v.string(),
    status: tenantStatus,
  },
  handler: async (ctx, { token, status }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    return ctx.db
      .query("tenants")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
  },
});

export const byHypothesis = query({
  args: { token: v.string(), hypothesisId: v.string() },
  handler: async (ctx, { token, hypothesisId }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    return ctx.db
      .query("tenants")
      .withIndex("by_hypothesis", (q) => q.eq("hypothesisId", hypothesisId))
      .first();
  },
});
