import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { requireUser } from "./users.js";

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

/**
 * Service-side: agent creates a tenant for a specific human user.
 * `actingUserId` is the user whose run this is — required so multi-tenant
 * scoping works downstream.
 */
export const create = mutation({
  args: {
    token: v.string(),
    actingUserId: v.id("users"),
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
      userId: args.actingUserId,
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
 * Storefront server-side: look up the connected Stripe account id for
 * the tenant at `subdomain`. Public-ish — same surface as bySubdomain;
 * the connected account id is not a secret (Stripe-Account headers
 * leak it on every Checkout redirect anyway). Returns null when the
 * tenant exists but the owner hasn't finished Stripe Connect onboarding,
 * which the caller surfaces as a "checkout temporarily unavailable"
 * state rather than throwing.
 */
export const ownerStripeAccount = query({
  args: { subdomain: v.string() },
  handler: async (ctx, { subdomain }) => {
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .first();
    if (!tenant) return null;
    const user = await ctx.db.get(tenant.userId);
    if (!user) return null;
    return {
      accountId: user.stripeConnectedAccountId ?? null,
      chargesEnabled: user.stripeChargesEnabled ?? false,
    };
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

/** Service callers: scoped to a specific user when actingUserId given. */
export const byStatus = query({
  args: {
    token: v.string(),
    status: tenantStatus,
    actingUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, { token, status, actingUserId }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    if (actingUserId) {
      return ctx.db
        .query("tenants")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", actingUserId).eq("status", status),
        )
        .collect();
    }
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

/** Human-side: list the current Clerk user's tenants for the console. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return ctx.db
      .query("tenants")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});
