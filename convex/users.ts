/**
 * Human user (Clerk-authenticated) provisioning + lookup.
 *
 * Provisioning is webhook-driven: Clerk fires user.created/updated/deleted
 * at /clerk-webhook (see http.ts), which calls upsertFromClerk /
 * deleteFromClerk here. Belt-and-suspenders client-side `current`
 * query gates first-render until the row exists.
 *
 * NOT IMMUTABLE — fields will grow (BYOK keys in P3, Stripe Connect
 * fields in P4). The `requireUser` helper itself should not change.
 */
import { v } from "convex/values";
import { requireIdentity } from "./_lib/identity.js";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";

/** Look up the current Clerk-authenticated user. Null if not signed in. */
async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

/** Throw if not signed in or not yet provisioned by the Clerk webhook. */
export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new Error(
      "Not authenticated, or user row not yet provisioned. Wait for Clerk webhook to land.",
    );
  }
  return user;
}

/** Client-side query: gate first-render on `current !== null`. */
export const current = query({
  args: {},
  handler: getCurrentUser,
});

/**
 * Webhook-only: upsert by tokenIdentifier. Called from the
 * Clerk → Convex http action after svix-verifying the payload.
 */
export const upsertFromClerk = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("users", {
      tokenIdentifier: args.tokenIdentifier,
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Self-serve: write Stripe Connect fields after creating an account or
 * receiving an `account.updated` webhook. Called from server actions
 * (Connect onboarding flow) and the Connect webhook endpoint.
 *
 * Webhook callers pass `webhookForUserId` because they don't have a
 * Clerk session — only a verified Stripe signature plus the connected
 * account id, which they map back to the user via `by_stripe_account`.
 */
export const setStripeConnectFields = mutation({
  args: {
    accountId: v.string(),
    country: v.optional(v.string()),
    chargesEnabled: v.optional(v.boolean()),
    payoutsEnabled: v.optional(v.boolean()),
    requirementsCurrentlyDue: v.optional(v.array(v.string())),
    webhookForUserId: v.optional(v.id("users")),
    webhookToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let userId;
    if (args.webhookForUserId && args.webhookToken) {
      await requireIdentity(args.webhookToken, ["stripe-webhook"]);
      userId = args.webhookForUserId;
    } else {
      const user = await requireUser(ctx);
      userId = user._id;
    }
    const patch: Record<string, unknown> = {
      stripeConnectedAccountId: args.accountId,
      updatedAt: Date.now(),
    };
    if (args.country !== undefined) patch["stripeCountry"] = args.country;
    if (args.chargesEnabled !== undefined)
      patch["stripeChargesEnabled"] = args.chargesEnabled;
    if (args.payoutsEnabled !== undefined)
      patch["stripePayoutsEnabled"] = args.payoutsEnabled;
    if (args.requirementsCurrentlyDue !== undefined)
      patch["stripeRequirementsCurrentlyDue"] = args.requirementsCurrentlyDue;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Webhook lookup: find the user that owns a connected Stripe account.
 * Used by the Connect webhook endpoint to map `account.updated` to a
 * user row.
 */
export const byStripeAccount = query({
  args: { token: v.string(), accountId: v.string() },
  handler: async (ctx, { token, accountId }) => {
    await requireIdentity(token, ["stripe-webhook", "admin"]);
    return ctx.db
      .query("users")
      .withIndex("by_stripe_account", (q) =>
        q.eq("stripeConnectedAccountId", accountId),
      )
      .first();
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/**
 * Self-serve: update the current user's BYOK API keys. Plaintext for
 * hackathon scope. Each field is optional — only the keys present in
 * the args object are written.
 */
export const updateApiKeys = mutation({
  args: {
    aiGatewayKey: v.optional(v.string()),
    exaKey: v.optional(v.string()),
    browserbaseKey: v.optional(v.string()),
    resendKey: v.optional(v.string()),
    reacherKey: v.optional(v.string()),
    niaKey: v.optional(v.string()),
    cloudflareKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const patch: Partial<Doc<"users">> = { updatedAt: Date.now() };
    for (const [k, value] of Object.entries(args)) {
      if (value !== undefined) (patch as Record<string, unknown>)[k] = value;
    }
    await ctx.db.patch(user._id, patch);
  },
});

/**
 * Agent-only — fetch a specific user's BYOK keys for a run.
 * Called from the parent-agent at run start to populate the
 * AsyncLocalStorage run context. Never exposed to dashboards or
 * storefronts; the agent identity is the only role allowed in.
 */
export const keysForUser = query({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, { token, userId }) => {
    await requireIdentity(token, ["agent"]);
    const u = await ctx.db.get(userId);
    if (!u) throw new Error(`user not found: ${userId}`);
    return {
      aiGateway: u.aiGatewayKey ?? null,
      exa: u.exaKey ?? null,
      browserbase: u.browserbaseKey ?? null,
      resend: u.resendKey ?? null,
      reacher: u.reacherKey ?? null,
      nia: u.niaKey ?? null,
      cloudflare: u.cloudflareKey ?? null,
    };
  },
});

/**
 * Self-serve safe-summary: which keys are set, never the values.
 * For the BYOK settings page indicator chips.
 */
export const apiKeyStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      aiGateway: !!user.aiGatewayKey,
      exa: !!user.exaKey,
      browserbase: !!user.browserbaseKey,
      resend: !!user.resendKey,
      reacher: !!user.reacherKey,
      nia: !!user.niaKey,
      cloudflare: !!user.cloudflareKey,
    };
  },
});
