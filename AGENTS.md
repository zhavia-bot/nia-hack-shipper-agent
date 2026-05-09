# AGENTS.md

Multi-tenant SaaS for autonomous TikTok-Shop hypothesis-testing agents. Each user signs up, connects their own Stripe account (Standard via Connect), brings their own API keys (BYOK), and the agent runs on their behalf. Terminal goal per user: **maximize the upstream conversion signal on their Stripe balance — every paid order auto-refunds, the demo is the artifact**.

## Shape (one paragraph)

One TS monorepo. A Vercel **Workflow** (`runGeneration`, `'use workflow'`) is the parent — one invocation per generation, fired by a cron trigger or the dashboard "Run a generation" button. It fans out N≤8 child workflows (`runHypothesis`, `'use workflow'`); each one **scouts** a real product on Temu/Alibaba via `agent-browser` inside `@vercel/sandbox`, **re-skins** the scraped photos into ad creatives via FLUX 2 (Gemini 3 Pro Image fallback), **ships** a tenant on a multi-tenant Next.js app on Vercel (subdomain-routed under `*.team.vercel.app`), mints a Stripe Checkout Session on the **user's connected Stripe account** (no platform fee), drives traffic, then `sleep('60m')` (durable), then measures. Every paid Checkout completion **auto-refunds** via Stripe Connect and emails the customer an apology via the operator's Resend key — the agent never has inventory. The body of each workflow is composed of `'use step'` units (`hypothesis-steps.ts`) which are idempotent + retryable. Convex is canonical state (users, tenants, experiments, ledger, lessons, budget, agentEvents) and the realtime backbone for the human dashboard. Every user-scoped row carries `userId`; service mutations take an explicit `actingUserId` while human mutations resolve identity via `requireUser(ctx)` (Clerk OIDC). Stripe Connect webhooks land at Next.js API routes and forward into Convex. **All LLM + image-gen calls route through Vercel AI Gateway** with a single user-provided `aiGatewayKey`. External sense organs: Reacher MCP (live TikTok-Shop niche feed), Nia MCP (deep-research priors + lesson corpus). External hands: Vercel Sandbox + agent-browser (scout), Resend (apology email). BYOK keys are re-hydrated at the top of every workflow step via `loadRunKeys(actingUserId)` from `apps/dashboard/agent/run-context.ts` (AsyncLocalStorage doesn't survive durable step replay).

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
   - `apps/dashboard/agent/budget.ts`, `apps/dashboard/agent/revenue.ts`
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

**Platform** (operator pays once, all users share): Stripe (platform of-record for Connect), Convex, Vercel (hosting + workflows + Sandbox CPU for the scout), Clerk, JWT keypair, apex domain (`*.team.vercel.app`).

**BYOK** (user provides via `/console/settings/keys`): `aiGatewayKey` (covers all LLM + image gen via Vercel AI Gateway), `resendKey` (apology email on demo refund), `reacherKey` (TikTok-Shop niche feed), `niaKey` (deep-research priors + lesson corpus). Four keys, all single-purpose.

The agent runtime never reads any of these BYOK values from `process.env`. They're loaded per workflow step via `loadRunKeys(actingUserId)` from `apps/dashboard/agent/run-context.ts`.

## Operator controls (P8.11–P8.13)

The console exposes three first-class operator surfaces:

- **Live agent stream** (`agentEvents` table + `AgentLogStream`) — every workflow decision (generation start, scout found, tenant live, measured ROAS, settled refund, crash) writes one narrative row keyed on `userId`. The console subscribes via `useQuery` and tails it without polling.
- **Per-tenant kill + force-refund** (`tenants:cancelByOwner`, `/api/operator/force-refund/[subdomain]`) — owner-only, ownership re-checked server-side. Force-refund sweeps every paid PaymentIntent on the connected account whose `metadata.tenantSubdomain` matches and refunds via the Stripe-Account header.
- **Explore/exploit slider** (`users.exploitFraction`) — single number in [0, 1] persisted on the user row. The agent reads it via `users:runSettingsForUser` at the top of every generation and derives the bandit slot mix from it. Default 0.7 preserves the original 70/20/10 split.

## Demo-safe settlement (P8.10)

Every `checkout.session.completed` with `payment_status === "paid"` triggers `settleDemoOrder` in `apps/storefronts/app/api/stripe-webhook/route.ts`: the storefront refunds the `payment_intent` on the connected account and (if the operator has a Resend key) sends a short apology naming the agent. The agent has no inventory and never will — the conversion signal is the artifact. Settlement failures are logged to `auditLog` and never re-thrown so the webhook ack stays clean.
