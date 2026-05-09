# AGENTS.md

Multi-tenant SaaS for autonomous money-making agents. Each user signs up, connects their own Stripe account (Standard via Connect), brings their own API keys (BYOK), and the agent runs on their behalf. Terminal goal per user: **maximize $ in their Stripe balance**.

## Shape (one paragraph)

One TS monorepo. A Vercel **Workflow** (`runGeneration`, `'use workflow'`) is the parent — one invocation per generation, fired by a cron trigger. It fans out N≤8 child workflows (`runHypothesis`, `'use workflow'`); each one ships a tenant on a multi-tenant Next.js app on Vercel (subdomain-routed), creates a Stripe Checkout-Session-driven storefront on the **user's connected Stripe account** (no platform fee), drives traffic, then `sleep('60m')` (durable), then measures. The body of each workflow is composed of `'use step'` units (`hypothesis-steps.ts`) which are idempotent + retryable. Convex is canonical state (users, tenants, experiments, ledger, lessons, budget) and the realtime backbone for the human dashboard. Every user-scoped row carries `userId`; service mutations take an explicit `actingUserId` while human mutations resolve identity via `requireUser(ctx)` (Clerk OIDC). Stripe Connect webhooks land at Next.js API routes and forward into Convex. **All LLM + image-gen calls route through Vercel AI Gateway** with a single user-provided `aiGatewayKey`. External sense organs: Reacher MCP, Nia MCP, Exa. External hands: Browserbase, Resend, Cloudflare API. BYOK keys are re-hydrated at the top of every workflow step via `loadRunKeys(actingUserId)` from `apps/parent-agent/src/run-context.ts` (AsyncLocalStorage doesn't survive durable step replay).

## Source of truth

- **Design**: `docs/stack.md`
- **Reviewer caveats** (already incorporated): `docs/readiness.md`
- **Progress** (resume point if conversation compacts): `STATUS.md`

## Pinned stack (verified 2026-05-09)

- Node 24 LTS, TypeScript 6.0, Next.js 16, pnpm 11, ESM only
- `convex@^1`, `stripe@^18`, `zod@^4`
- Agent runtime: `workflow@^4` (Vercel Workflows, `'use workflow'` / `'use step'` / durable `sleep`)
- LLM + image gen: `ai@^6` + `@ai-sdk/gateway@^3` (single user-provided key routes Anthropic, OpenAI, FLUX, Gemini Image)

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

7. **Image generation** — `bfl/flux-2-flex` primary, `google/gemini-3-pro-image` fallback on policy/rate errors, both via Vercel AI Gateway (`@ai-sdk/gateway` + `experimental_generateImage`). Persist to **Convex File Storage**; tenants reference our URL, never expiring provider URLs.

8. **Identity provider** — Clerk for human sessions (the dashboard). Custom RS256 JWTs in `packages/auth` for service identities (agent, webhooks, admin). The two coexist: Convex `auth.config.ts` registers Clerk as an OIDC provider for `ctx.auth`, while service callers pass an explicit `token` arg validated by `convex/_lib/identity.ts`.

## BYOK split

**Platform** (operator pays once, all users share): Stripe (platform of-record for Connect), Convex, Vercel (hosting + workflows), Clerk, JWT keypair, apex domain.

**BYOK** (user provides via `/console/settings/keys`): `aiGatewayKey` (covers all LLM + image gen via Vercel AI Gateway), `exaKey`, `browserbaseKey`, `resendKey`, `reacherKey`, `niaKey`, `cloudflareKey`. No more separate Anthropic / OpenAI / FAL keys — Gateway covers all three.

The agent runtime never reads any of these BYOK values from `process.env`. They're loaded per workflow step via `loadRunKeys(actingUserId)` from `apps/parent-agent/src/run-context.ts`.
