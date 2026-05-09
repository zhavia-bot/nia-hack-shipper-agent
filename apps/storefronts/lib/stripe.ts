import Stripe from "stripe";
import { env } from "./env.js";

let cached: Stripe | null = null;

/**
 * Server-side Stripe client for the storefront. Same restricted key
 * the agent uses (`checkout.sessions.create`, `.retrieve`,
 * `events.list/retrieve`, `products.create`, `prices.create`).
 * The storefront only invokes the first two in practice; the rest
 * are agent-side. Restricted-key scope is the structural defense
 * against a code-path that calls anything else.
 */
export function stripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(env().STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}
