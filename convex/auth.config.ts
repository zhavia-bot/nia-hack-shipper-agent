/**
 * Convex first-party auth providers. Used for HUMAN identity only.
 *
 * Clerk authenticates dashboard users; the Clerk-issued JWT (template
 * named "convex" with `aud: "convex"`) is forwarded by
 * `<ConvexProviderWithClerk>` and validated here. In Convex functions,
 * call `await ctx.auth.getUserIdentity()` to get the Clerk subject (the
 * user id) — that's the key for `users` table lookups.
 *
 * SERVICE identity (agent, stripe-webhook, refund-worker, dashboard
 * service token, admin, budget-watchdog) does NOT go through this
 * config. Those are RS256 JWTs minted by `packages/auth`, passed as
 * explicit `token` args, and validated inline by
 * `_lib/identity.ts::requireIdentity`. See AGENTS.md invariant #5.
 *
 * Env required (set on Convex deployment via `npx convex env set`):
 *   CLERK_JWT_ISSUER_DOMAIN  — e.g. https://<slug>.clerk.accounts.dev
 */
export default {
  providers: [
    {
      domain: process.env["CLERK_JWT_ISSUER_DOMAIN"] ?? "",
      applicationID: "convex",
    },
  ],
};
