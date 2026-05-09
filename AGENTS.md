# AGENTS.md

Multi-tenant SaaS for autonomous money-making agents. Each user signs up, connects their own Stripe account (Standard via Connect), brings their own API keys (BYOK), and the agent runs on their behalf. Terminal goal per user: **maximize $ in their Stripe balance**.

## Shape (one paragraph)

One TS monorepo. A Tensorlake parent (1) spawns parallel children (≤8), each running one hypothesis: generate a digital product, deploy it as a tenant on a multi-tenant Next.js app on Vercel (subdomain-routed), create a Stripe Checkout-Session-driven storefront on the **user's connected Stripe account** (no platform fee), drive traffic, measure ROAS. Convex is canonical state (users, tenants, experiments, ledger, lessons, budget) and the realtime backbone for the human dashboard. Every user-scoped row carries `userId`; service mutations take an explicit `actingUserId` while human mutations resolve identity via `requireUser(ctx)` (Clerk OIDC). Stripe Connect webhooks land at Vercel API routes and forward into Convex. External sense organs: Reacher MCP, Nia MCP, Exa. External hands: Browserbase, Resend, Cloudflare API. Image gen: gpt-image-2 primary, FLUX 2 Pro fallback. BYOK keys flow into the agent runtime via `AsyncLocalStorage` in `apps/parent-agent/src/run-context.ts`.

## Source of truth

- **Design**: `docs/stack.md`
- **Reviewer caveats** (already incorporated): `docs/readiness.md`
- **Progress** (resume point if conversation compacts): `STATUS.md`

## Pinned stack (verified 2026-05-09)

- Node 24 LTS, TypeScript 6.0, Next.js 16, pnpm 11, ESM only
- `convex@^1`, `stripe@^18`, `openai@^5` (gpt-image-2), `@fal-ai/client@^1` (FLUX 2 Pro), `zod@^4`, `@tensorlake/sdk@latest`

## Hard invariants (do not violate)

1. **Immutable substrate** — agent must never edit:
   - `apps/parent-agent/src/budget.ts`, `apps/parent-agent/src/revenue.ts`
   - `convex/ledger.ts`, `convex/budget.ts`

   These are the Karpathy `prepare.py` analog. CODEOWNERS gates them.

2. **Stripe surface** — Checkout Sessions only. **No Payment Links.** Attribution via `client_reference_id = experimentId` and metadata `{ experimentId, hypothesisId, tenantSubdomain, generation }`.

3. **Revenue recognition** — book to `ledgerEvents` only when:
   - `checkout.session.completed` AND `payment_status === "paid"`, OR
   - `checkout.session.async_payment_succeeded`

   Idempotent on `stripeEventId`. Non-paid completions go to `auditLog` only.

4. **Budget atomicity** — children call `budget:reserve` (Convex transactional mutation) BEFORE any external spend. No pre-loop aggregate budget checks. Reservation is finalized or released at experiment conclusion.

5. **Caller-identity ACLs** — service-side mutations begin `await requireIdentity(token, [allowedRoles])`. Service identities: `agent`, `stripe-webhook`, `refund-worker`, `dashboard`, `admin`, `budget-watchdog`. Human-side mutations (anything called from the dashboard with a Clerk session) begin `await requireUser(ctx)` and resolve `userId` from `ctx.auth.getUserIdentity()`. Convex deploy keys deploy code; they do **not** enforce row-level ACLs.

6. **Stripe action allowlist** — wrap toolkit in a build-time `Proxy` permitting only: `products.create`, `prices.create`, `checkout.sessions.{create,retrieve}`, `events.{list,retrieve}`. Defense-in-depth on the restricted key.

7. **Image generation** — gpt-image-2 primary, FLUX 2 Pro via fal.ai fallback on policy/rate errors. Persist to **Convex File Storage**; tenants reference our URL, never expiring OpenAI URLs.

8. **Identity provider** — Clerk for human sessions (the dashboard). Custom RS256 JWTs in `packages/auth` for service identities (agent, webhooks, admin). The two coexist: Convex `auth.config.ts` registers Clerk as an OIDC provider for `ctx.auth`, while service callers pass an explicit `token` arg validated by `convex/_lib/identity.ts`.

## Build plan (11 commits)

Each step ends with `/git-commit` and a STATUS.md update.

1. Monorepo scaffold (root config files)
2. `packages/schemas`
3. `packages/shared`
4. `packages/bandit`
5. `packages/deliverables`
6. `packages/prompts`
7. `packages/auth`
8. `convex/`
9. `apps/parent-agent` (includes `program.md` skill)
10. `apps/storefronts`
11. `apps/dashboard`

No tests, no deploys in this pass — those come later.
