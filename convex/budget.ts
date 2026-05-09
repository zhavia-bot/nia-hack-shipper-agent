/**
 * IMMUTABLE — the agent must never edit this file. Karpathy `prepare.py`
 * analog. CODEOWNERS gates changes.
 *
 * Closes the TOCTOU window on budget caps (P0 #3 fix from `docs/stack.md`
 * §5.7). Convex mutations are serializable per-document, so the
 * sum-then-check-then-insert sequence inside `reserve` is atomic — concurrent
 * children cannot collectively exceed the cap.
 *
 * Identity rules:
 *   - `agent` may reserve / report-spend / finalize / release.
 *   - `admin` may set caps and toggle the kill switch.
 *   - `budget-watchdog` may ONLY set killSwitchHalt = true (cannot raise caps).
 *   - All other identities forbidden.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { requireIdentity } from "./_lib/identity.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function readBudgetState(ctx: { db: { query: (t: "budgetState") => any } }) {
  const state = await ctx.db.query("budgetState").first();
  if (!state) {
    throw new Error(
      "budgetState singleton missing — run admin:initBudgetState"
    );
  }
  return state;
}

async function sumActiveAndFinalized(
  ctx: { db: { query: (t: "budgetReservations") => any } },
  generation: number
): Promise<number> {
  const active = await ctx.db
    .query("budgetReservations")
    .withIndex("by_generation_status", (q: any) =>
      q.eq("generation", generation).eq("status", "active")
    )
    .collect();
  const finalized = await ctx.db
    .query("budgetReservations")
    .withIndex("by_generation_status", (q: any) =>
      q.eq("generation", generation).eq("status", "finalized")
    )
    .collect();
  let sum = 0;
  for (const r of [...active, ...finalized]) {
    sum += r.status === "active" ? r.reservedUsd : r.spentUsd;
  }
  return sum;
}

async function sumDayCommitted(
  ctx: { db: { query: (t: "budgetReservations") => any } }
): Promise<number> {
  const cutoff = Date.now() - ONE_DAY_MS;
  const recent = await ctx.db
    .query("budgetReservations")
    .withIndex("by_status_time", (q: any) =>
      q.eq("status", "active").gte("reservedAt", cutoff)
    )
    .collect();
  const recentFinalized = await ctx.db
    .query("budgetReservations")
    .withIndex("by_status_time", (q: any) =>
      q.eq("status", "finalized").gte("reservedAt", cutoff)
    )
    .collect();
  let sum = 0;
  for (const r of recent) sum += r.reservedUsd;
  for (const r of recentFinalized) sum += r.spentUsd;
  return sum;
}

export const reserve = mutation({
  args: {
    token: v.string(),
    experimentId: v.string(),
    generation: v.number(),
    amountUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);

    if (args.amountUsd <= 0) throw new Error("PER_EXP_CAP: amount must be > 0");

    const state = await readBudgetState(ctx);
    if (state.killSwitchHalt) throw new Error("HALTED");
    if (args.amountUsd > state.perExperimentUsd)
      throw new Error("PER_EXP_CAP");

    const generationCommitted = await sumActiveAndFinalized(ctx, args.generation);
    if (generationCommitted + args.amountUsd > state.perGenerationUsd)
      throw new Error("PER_GEN_CAP");

    const dayCommitted = await sumDayCommitted(ctx);
    if (dayCommitted + args.amountUsd > state.perDayUsd)
      throw new Error("PER_DAY_CAP");

    return ctx.db.insert("budgetReservations", {
      experimentId: args.experimentId,
      generation: args.generation,
      reservedUsd: args.amountUsd,
      spentUsd: 0,
      status: "active",
      reservedAt: Date.now(),
    });
  },
});

export const reportSpend = mutation({
  args: {
    token: v.string(),
    reservationId: v.id("budgetReservations"),
    amountUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    if (args.amountUsd < 0) throw new Error("OVERSPEND: amount must be ≥0");

    const r = await ctx.db.get(args.reservationId);
    if (!r) throw new Error("reservation not found");
    if (r.status !== "active") {
      throw new Error(`reservation ${r.status}, cannot reportSpend`);
    }
    const newSpent = r.spentUsd + args.amountUsd;
    if (newSpent > r.reservedUsd) throw new Error("OVERSPEND");
    await ctx.db.patch(args.reservationId, { spentUsd: newSpent });
  },
});

export const finalize = mutation({
  args: { token: v.string(), reservationId: v.id("budgetReservations") },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    const r = await ctx.db.get(args.reservationId);
    if (!r) throw new Error("reservation not found");
    if (r.status !== "active") return; // idempotent
    await ctx.db.patch(args.reservationId, {
      status: "finalized",
      finalizedAt: Date.now(),
    });
  },
});

export const release = mutation({
  args: { token: v.string(), reservationId: v.id("budgetReservations") },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["agent"]);
    const r = await ctx.db.get(args.reservationId);
    if (!r) throw new Error("reservation not found");
    if (r.status !== "active") return; // idempotent
    await ctx.db.patch(args.reservationId, {
      status: "released",
      finalizedAt: Date.now(),
    });
  },
});

export const state = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireIdentity(token, ["agent", "dashboard", "admin"]);
    return ctx.db.query("budgetState").first();
  },
});

export const setCaps = mutation({
  args: {
    token: v.string(),
    perExperimentUsd: v.number(),
    perGenerationUsd: v.number(),
    perDayUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["admin"]);
    const cur = await ctx.db.query("budgetState").first();
    const patch = {
      perExperimentUsd: args.perExperimentUsd,
      perGenerationUsd: args.perGenerationUsd,
      perDayUsd: args.perDayUsd,
      updatedAt: Date.now(),
    };
    if (cur) {
      await ctx.db.patch(cur._id, patch);
      return cur._id;
    }
    return ctx.db.insert("budgetState", {
      ...patch,
      killSwitchHalt: false,
    });
  },
});

export const setKillSwitch = mutation({
  args: {
    token: v.string(),
    halt: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claims = await requireIdentity(args.token, [
      "admin",
      "budget-watchdog",
    ]);

    // Watchdog can ONLY set halt=true. It cannot lift the halt or raise caps.
    if (claims.role === "budget-watchdog" && args.halt !== true) {
      throw new Error("budget-watchdog may only set killSwitchHalt = true");
    }

    const cur = await ctx.db.query("budgetState").first();
    if (!cur) {
      throw new Error(
        "budgetState singleton missing — run admin:initBudgetState first"
      );
    }
    await ctx.db.patch(cur._id, {
      killSwitchHalt: args.halt,
      killSwitchReason: args.reason,
      updatedAt: Date.now(),
    });
  },
});

/** Admin-only initialization. Idempotent. */
export const initBudgetState = mutation({
  args: {
    token: v.string(),
    perExperimentUsd: v.optional(v.number()),
    perGenerationUsd: v.optional(v.number()),
    perDayUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(args.token, ["admin"]);
    const existing = await ctx.db.query("budgetState").first();
    if (existing) return existing._id;
    return ctx.db.insert("budgetState", {
      perExperimentUsd: args.perExperimentUsd ?? 20,
      perGenerationUsd: args.perGenerationUsd ?? 100,
      perDayUsd: args.perDayUsd ?? 500,
      killSwitchHalt: false,
      updatedAt: Date.now(),
    });
  },
});
