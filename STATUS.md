# STATUS

Resume point if context compacts. Read this + `AGENTS.md` to pick up.

## Pivot in progress (2026-05-09)

We're pivoting from "single-operator agent" → "multi-tenant SaaS where any user signs up and the agent runs against their connected Stripe + their own API keys (BYOK)." See conversation for full plan; no payment from users, no platform fee, ~7hr scope.

### Phase plan

- **P1 — Auth foundation**
  - [x] P1.1 packages/auth HS256 → RS256 (commit `b5269f2`). Convex env: `AUTH_JWT_PUBLIC_KEY` set; `AUTH_JWT_SECRET` removed. Service tokens re-minted in `.env.local`. Smoke-tested: `dashboard:netDollars` accepts new RS256 token.
  - [x] P1.2 Clerk on apps/dashboard (commit `2a8b1d1`). `proxy.ts` (Next 16 rename) protects `/console/*`. `<Show when=…>` for nav state. Sign-in/up pages.
  - [x] P1.3 convex/auth.config.ts (commit `a2b5a03`). Clerk OIDC provider with domain = CLERK_JWT_ISSUER_DOMAIN. Service JWTs keep their inline path.
  - [x] P1.4 users table + requireUser + clerk-webhook httpAction (same commit). svix-verified user.created/updated/deleted handlers.

**P1 complete — pending end-to-end smoke test by user.**
- **P2 — userId scoping on tenants/experiments/ledger** (commit `0a5cc98`)
  - schema: userId + by_user/by_user_status/by_user_generation/by_user_time indexes
  - tenants/experiments service mutations take explicit `actingUserId`
  - ledger recordCharge/recordRefund derive userId via `tenantSubdomain` lookup; recordAdSpend takes `actingUserId`
  - new `mine*` queries (tenants, experiments, ledger) for Clerk-authenticated console reads
  - storefront stripe-webhook updated: routes paid/refund through `tenantSubdomain` from session/charge metadata; missing → audit log + skip
  - **deferred**: parent-agent caller updates (will land in P3 when dashboard drives runs); budget/lessons/agentRuns scoping (not user-scoped for hackathon)
- **P3.1 — BYOK settings page** (commit `97c2d81`). `/console/settings/keys` with set/missing chips per provider; patches via `users:updateApiKeys`. Header link from `/console`.
- **P3.2 — agent runtime reads keys from user row** (commit `2462a1c`). New `users:keysForUser` (agent-only) + `apps/parent-agent/src/run-context.ts` (AsyncLocalStorage). Tools refactored: openai, fal, browserbase, resend, reacher, nia, cloudflare. `Hypothesis.actingUserId` is now required. Anthropic/Exa/Stripe/Vercel stay platform-level.
- **P4.1 — packages/connect** (commit `69497c5`). Stripe Standard via controller properties. `forConnectedAccount(accountId)` factory; `users:setStripeConnectFields` + `users:byStripeAccount` + `by_stripe_account` index.
- **P4.2 — dashboard Connect onboarding UI** (commit `776046c`). `/console/settings/stripe` with status banner. `/api/connect/start` mints account-link; `/api/connect/return` syncs status. Server actions auth via Convex 'convex' JWT template.
- **P4.3 — per-tenant Stripe factory in storefronts** (commit `9b51c16`). `stripeForTenant(accountId)` for checkout / deliver / success. `tenants:ownerStripeAccount` lookup. Returns 503 when owner hasn't onboarded.
- **P5 — Connect webhook for account.updated** (commit `e7ca76e`). `/api/stripe-webhook` on dashboard. Verifies STRIPE_CONNECT_WEBHOOK_SECRET, maps `account.updated` → user row via `users:byStripeAccount`. Other Connect events (charge/refund/dispute) keep flowing through the storefront webhook.
- **P6** — AGENTS.md cleanup, basic-auth removal, landing copy

### Pre-pivot done

1–12. (See git log for the full build of monorepo + packages + convex + parent-agent + storefronts + dashboard.)

13. Reacher tool fixed (proper auth headers + shop discovery) — `d44500f`
14. Convex codegen committed + node types — `6db18e7`
15. Root convex dep + pnpm allowlist + tensorlake optional — `dc1848b`
16. Storefronts shadcn/CommerCN catalog-density rewrite — `d845971`
17. Mint-tokens.ts self-contained via jose — `39bfff7`
18. Dashboard public landing for hackathon judges (`/`) + console moved to `/console` — `e99cc4c`

## Notes

- Identity is now RS256. `packages/auth/src/secret.ts` exports `loadPrivateKey()` / `loadPublicKey()`. `convex/_lib/identity.ts` reads `AUTH_JWT_PUBLIC_KEY` (base64 PEM) from Convex env, decodes via `atob` (no Buffer in Convex runtime).
- AGENTS.md invariant #8 ("Not Clerk") will be reworded in P6 — Clerk for human sessions, custom JWT for service identities.
- Hackathon scope: no signup gate, no encryption on stored API keys (plaintext on user row), no platform fee.
