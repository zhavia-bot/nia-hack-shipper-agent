import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";
import { requireUser } from "./users.js";

const tenantStatus = v.union(
  v.literal("live"),
  v.literal("paused"),
  v.literal("killed")
);

const productSourceValidator = v.object({
  marketplace: v.string(),
  url: v.string(),
  originalTitle: v.string(),
  originalPriceUsd: v.number(),
  scrapedImageStorageIds: v.array(v.string()),
});

/**
 * Service-side: agent creates a tenant for a specific human user.
 * `actingUserId` is the user whose run this is — required so multi-tenant
 * scoping works downstream. P8.1 pivot: tenants now carry a Temu/Alibaba
 * product source + AI-generated ad creatives instead of a digital
 * deliverable.
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
    productSource: productSourceValidator,
    adCreativeStorageIds: v.array(v.string()),
    displayCopy: v.object({
      headline: v.string(),
      subhead: v.string(),
      bullets: v.array(v.string()),
      cta: v.string(),
    }),
    displayPriceUsd: v.number(),
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
      productSource: args.productSource,
      adCreativeStorageIds: args.adCreativeStorageIds,
      displayCopy: args.displayCopy,
      displayPriceUsd: args.displayPriceUsd,
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
 * Service-side: settlement info for the demo refund-all path (P8.10).
 * Returns the connected Stripe account (for the refund call) and the
 * owner's BYOK Resend key + a sensible from-email (their account email
 * is the fallback). Identity check: `stripe-webhook` is the only role
 * that ever needs this; we do not expose customer-visible keys to
 * dashboard or storefront identities.
 */
export const ownerSettlementInfo = query({
  args: { token: v.string(), subdomain: v.string() },
  handler: async (ctx, { token, subdomain }) => {
    await requireIdentity(token, ["stripe-webhook"]);
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .first();
    if (!tenant) return null;
    const user = await ctx.db.get(tenant.userId);
    if (!user) return null;
    return {
      accountId: user.stripeConnectedAccountId ?? null,
      resendKey: user.resendKey ?? null,
      fromEmail: user.email ?? null,
      ownerName: user.name ?? null,
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

/**
 * Operator panic button: kill a hypothesis the calling user owns.
 * Sets status='killed' so the storefront short-circuits to 404 and
 * the runHypothesis workflow's measurement step sees a non-live tenant.
 *
 * The force-refund API route in the dashboard always calls this first,
 * so a successful POST to /api/operator/force-refund implies the
 * tenant is killed *before* refunds start landing — Stripe webhooks
 * for those refunds then book to a status=killed tenant, which the
 * dashboard renders distinctly.
 */
export const cancelByOwner = mutation({
  args: { subdomain: v.string() },
  handler: async (ctx, { subdomain }) => {
    const user = await requireUser(ctx);
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .unique();
    if (!tenant) throw new Error(`tenant not found: ${subdomain}`);
    if (tenant.userId !== user._id) {
      throw new Error("not your tenant");
    }
    if (tenant.status !== "killed") {
      await ctx.db.patch(tenant._id, { status: "killed" });
    }
  },
});

/**
 * Operator side-channel: fetch the tenant + connected-account id for
 * a tenant the current user owns. The dashboard's force-refund route
 * needs both (subdomain → tenant for sanity, accountId → Stripe-Account
 * header). We re-check ownership here so the API route can rely on a
 * single Convex round-trip; throwing on mismatch keeps the route's
 * happy-path simple.
 */
export const operatorContext = query({
  args: { subdomain: v.string() },
  handler: async (ctx, { subdomain }) => {
    const user = await requireUser(ctx);
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", subdomain))
      .unique();
    if (!tenant) return null;
    if (tenant.userId !== user._id) return null;
    return {
      tenantId: tenant._id,
      subdomain: tenant.subdomain,
      experimentId: tenant.experimentId,
      hypothesisId: tenant.hypothesisId,
      status: tenant.status,
      accountId: user.stripeConnectedAccountId ?? null,
    };
  },
});
