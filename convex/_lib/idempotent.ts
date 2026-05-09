import type { QueryCtx } from "../_generated/server.js";

/**
 * Idempotency check on Stripe webhook events. The webhook commonly retries
 * the same event after a 4xx/5xx response from us; if we've already
 * recorded it, return the existing row and let the caller short-circuit.
 *
 * IMMUTABLE — used by `ledger:recordCharge` and `ledger:recordRefund`.
 */
export async function findByStripeEvent(
  ctx: QueryCtx,
  table: "ledgerEvents" | "auditLog",
  stripeEventId: string
) {
  return ctx.db
    .query(table)
    .withIndex("by_stripe_event", (q) => q.eq("stripeEventId", stripeEventId))
    .first();
}
