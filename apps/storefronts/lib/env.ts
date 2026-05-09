import { z } from "zod";

/**
 * Storefront env. Note what is intentionally absent:
 *   - No agent JWT — storefronts never assume agent identity.
 *   - No admin tokens or Stripe master key.
 *
 * Three secrets the storefront DOES need:
 *   - `STRIPE_SECRET_KEY`: restricted key (same one the agent uses).
 *     The storefront only ever calls `checkout.sessions.create` and
 *     `checkout.sessions.retrieve` from this surface.
 *   - `STRIPE_WEBHOOK_SECRET`: webhook signing secret. Verified on
 *     every webhook request before any state mutates.
 *   - `CONVEX_STOREFRONT_TOKEN`: HS256 JWT minted by the deploy
 *     pipeline with role=`stripe-webhook` (covers webhook ingest
 *     AND deliver-route reads).
 *   - `DELIVER_TOKEN_SECRET`: HMAC secret for signed deliverable
 *     URLs (per stack.md §10.3). Min 32 bytes.
 */
const Schema = z.object({
  CONVEX_URL: z.string().url(),
  CONVEX_STOREFRONT_TOKEN: z.string().min(20),

  STRIPE_SECRET_KEY: z.string().startsWith("rk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),

  DELIVER_TOKEN_SECRET: z.string().min(32),

  APEX_DOMAIN: z.string().min(3),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

let cached: z.infer<typeof Schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Storefront env invalid: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
