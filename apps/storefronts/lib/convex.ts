import { ConvexHttpClient } from "convex/browser";
import { env } from "./env.js";

let cached: ConvexHttpClient | null = null;

/**
 * Server-side Convex client for the storefront. Token-bearing calls
 * are made via the `stripe-webhook` identity (which is also used by
 * the deliver route — both run in the same Vercel project and share
 * a JWT). Public queries (`tenants:bySubdomain`) take no token.
 */
export function convex(): ConvexHttpClient {
  if (cached) return cached;
  cached = new ConvexHttpClient(env().CONVEX_URL);
  return cached;
}

export function storefrontToken(): string {
  return env().CONVEX_STOREFRONT_TOKEN;
}
