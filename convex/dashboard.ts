/**
 * Dashboard read-only aggregators. Lives outside `budget.ts`/`ledger.ts`
 * (which are IMMUTABLE write surfaces) so the boundary between "money
 * writes" and "human reads" is explicit.
 *
 * All queries are read-only and require `dashboard` or `admin` identity.
 */
import { v } from "convex/values";
import { query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single most important metric. Sum of all `ledgerEvents.amountUsd`
 * — equals net $ in Stripe balance once webhooks have caught up.
 */
export const netDollars = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["dashboard", "admin", "agent"]);
    const events = await ctx.db.query("ledgerEvents").collect();
    let net = 0;
    let charges = 0;
    let refunds = 0;
    let adSpend = 0;
    for (const e of events) {
      net += e.amountUsd;
      if (e.type === "charge") charges += e.amountUsd;
      else if (e.type === "refund") refunds += e.amountUsd;
      else if (e.type === "ad_spend") adSpend += e.amountUsd;
    }
    return {
      net,
      charges,
      refunds,
      adSpend,
      eventCount: events.length,
      asOf: Date.now(),
    };
  },
});

/**
 * Per-generation budget rollup. Sums `spentUsd` across all reservations
 * (active, finalized, released) and pairs with the cap from
 * `budgetState`. Returns `null` if the singleton hasn't been initialized.
 */
export const budgetSnapshot = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    const state = await ctx.db.query("budgetState").first();
    if (!state) return null;

    const since = Date.now() - DAY_MS;
    const todayReservations = await ctx.db
      .query("budgetReservations")
      .withIndex("by_status_time")
      .filter((q) => q.gte(q.field("reservedAt"), since))
      .collect();
    const todaySpent = todayReservations.reduce((s, r) => s + r.spentUsd, 0);
    const todayReserved = todayReservations.reduce(
      (s, r) => s + (r.status === "active" ? r.reservedUsd : 0),
      0
    );

    const allActive = await ctx.db
      .query("budgetReservations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const activeReservedTotal = allActive.reduce(
      (s, r) => s + r.reservedUsd,
      0
    );
    const activeSpentTotal = allActive.reduce((s, r) => s + r.spentUsd, 0);

    return {
      caps: {
        perExperimentUsd: state.perExperimentUsd,
        perGenerationUsd: state.perGenerationUsd,
        perDayUsd: state.perDayUsd,
      },
      killSwitch: {
        halt: state.killSwitchHalt,
        reason: state.killSwitchReason ?? null,
      },
      today: {
        spentUsd: todaySpent,
        reservedActiveUsd: todayReserved,
        reservationCount: todayReservations.length,
      },
      active: {
        reservedUsd: activeReservedTotal,
        spentUsd: activeSpentTotal,
        count: allActive.length,
      },
      asOf: Date.now(),
    };
  },
});

/**
 * Latest experiments — for the live ops feed and crash log filters.
 * Limit defaults to 50; max 200 to avoid blowing up the realtime
 * sub payload.
 */
export const recentExperiments = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    const cap = Math.min(Math.max(limit ?? 50, 1), 200);
    return ctx.db.query("experiments").order("desc").take(cap);
  },
});

/**
 * Niche × format × channel rollup, for the bucket heatmap.
 * Aggregated client-side; the data is small.
 */
export const bucketRollup = query({
  args: { token: v.string(), generation: v.optional(v.number()) },
  handler: async (ctx, { token, generation }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    const xs =
      generation == null
        ? await ctx.db.query("experiments").collect()
        : await ctx.db
            .query("experiments")
            .withIndex("by_generation", (q) => q.eq("generation", generation))
            .collect();
    return xs.map((x) => ({
      bucket: x.bucket,
      spendUsd: x.spendUsd,
      revenueUsd: x.revenueUsd,
      visitors: x.visitors,
      conversions: x.conversions,
      roasMean: x.roasMean ?? null,
      status: x.status,
    }));
  },
});

/**
 * Last N ledger events for the live feed under the $ ticker.
 */
export const recentLedger = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireIdentity(token, ["dashboard", "admin"]);
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    return ctx.db
      .query("ledgerEvents")
      .withIndex("by_timestamp")
      .order("desc")
      .take(cap);
  },
});
