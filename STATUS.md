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
- **P6 — cleanup** (commit `2f7fb53`). AGENTS.md invariants #5/#8 + Shape paragraph reframed for multi-tenant SaaS + Clerk/JWT coexistence. `DASHBOARD_BASIC_AUTH` dropped from `mint-tokens.ts`. Landing copy reframed for BYOK/Connect signup.

## P7 — Vercel Workflows + AI Gateway pivot (2026-05-09, in progress)

Tensorlake doesn't exist on npm under `@tensorlake/sdk`; the real package is `tensorlake` (microVM sandboxes). For a hackathon we go all-in on Vercel: Workflows for durable orchestration, AI Gateway for LLM routing, Sandbox deferred. Philosophy update: **user provides every key the agent burns** (LLM, search, browser, email, image, DNS). Platform only pays for things that make the platform itself exist (Stripe of-record, Convex, Vercel hosting, Clerk, JWT keypair, apex domain).

- **P7.1 — strip Tensorlake stub, install vercel deps** (commit `<TBD>`). Removed `apps/parent-agent/src/tensorlake.ts`. Added `workflow`, `ai`, `@ai-sdk/gateway` to parent-agent. `deploy` script: `tensorlake deploy` → `vercel deploy`. `orchestrator.ts` and `child.ts` are intentionally broken at this checkpoint — rewritten in P7.5/P7.6. Dashboard + storefronts + convex still boot fine.
- **P7.2** — env reshape: drop platform LLM keys, add `aiGatewayKey` + `exaKey` to user row + BYOK form
- **P7.3** — text LLM calls through AI Gateway via `ai` package
- **P7.4** — image gen through AI Gateway where supported (FLUX confirmed; gpt-image-2 TBD via /v1/models)
- **P7.5** — `while(true)` orchestrator → cron-triggered Vercel Workflow
- **P7.6** — child split into `ship-experiment` + `measure-experiment` workflows over `step.sleep`
- **P7.7** — dashboard "run a generation" trigger + docs sweep (AGENTS.md, stack.md, landing)

## Pivot complete (2026-05-09)

All P1–P6 phases shipped. Multi-tenant SaaS topology in place: Clerk-authenticated users, BYOK keys threaded through `AsyncLocalStorage`, Stripe Standard onboarding via packages/connect, per-tenant Checkout via `stripeForTenant()`, account-status reconciliation via Connect webhook.

### Smoke-test before declaring victory

1. Sign up via Clerk → confirm `users` row provisions via webhook
2. `/console/settings/keys` → save a key → re-render shows "set"
3. `/console/settings/stripe` → "Connect Stripe" → finish hosted onboarding → return URL syncs status → banner flips to "ready to charge"
4. (Optional) Trigger an `account.updated` from Stripe to verify the dashboard webhook updates the row
5. Storefront checkout on a live tenant → Checkout Session created on user's connected account; success page retrieves it via `stripeForTenant`

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
