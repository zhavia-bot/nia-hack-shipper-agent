import Stripe from "stripe";
import { forConnectedAccount } from "@autodrop/connect";
import { env } from "./env.js";

let cached: Stripe | null = null;

/**
 * Platform Stripe client — used by the webhook (signature verification,
 * platform-level event reads) and any flow that doesn't act on a
 * specific connected account. Per-tenant Checkout Sessions go through
 * `stripeForTenant()` instead, which scopes the call to the tenant
 * owner's Standard account.
 */
export function stripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(env().STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}

/**
 * Per-tenant Stripe client — sets `Stripe-Account: acct_*` on every
 * call so resources land on the tenant owner's connected account.
 * Used to mint Checkout Sessions and retrieve them on the success
 * page.
 */
export function stripeForTenant(connectedAccountId: string): Stripe {
  return forConnectedAccount(env().STRIPE_SECRET_KEY, connectedAccountId);
}
