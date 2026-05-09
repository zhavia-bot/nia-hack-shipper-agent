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

- **P7.1 — strip Tensorlake stub, install vercel deps** (commit `b2e5764`). Removed `apps/parent-agent/src/tensorlake.ts`. Added `workflow`, `ai`, `@ai-sdk/gateway` to parent-agent. `deploy` script: `tensorlake deploy` → `vercel deploy`. `orchestrator.ts` and `child.ts` are intentionally broken at this checkpoint — rewritten in P7.5/P7.6. Dashboard + storefronts + convex still boot fine.
- **P7.2 — env reshape, BYOK = everything the agent burns** (commit `dcf8a2e`). `convex/schema.ts` users gains `aiGatewayKey` + `exaKey`. `convex/users.ts` mutations/queries updated. `apps/dashboard/components/byok-form.tsx` adds AI Gateway + Exa fields. `apps/parent-agent/src/env.ts` shrunk to 6 platform vars (Stripe restricted, Convex URL+token, Vercel token+project, Apex). `run-context.ts` `RunKeys` includes `aiGateway` + `exa`; env fallback removed — getKey throws if BYOK missing. Cloudflare DNS/Registrar split collapsed (one user-provided key serves both).
- **P7.3 — text LLM calls through Vercel AI Gateway** (commit `e8fb3ab`). `tools/llm.ts` rewritten on `ai` + `@ai-sdk/gateway`. `generateObject` replaces hand-rolled JSON-parse/strip-fence/retry. Models: `anthropic/claude-opus-4.6` + `claude-sonnet-4.6`. Per-user `aiGatewayKey` from `getKey('aiGateway')`. `@anthropic-ai/sdk` removed from parent-agent deps.
- **P7.4 — image gen fully through AI Gateway** (commit `c0e1a85`). Primary `bfl/flux-2-flex`, fallback `google/gemini-3-pro-image`. AI SDK `experimental_generateImage` via `@ai-sdk/gateway`. Returns base64 data URLs (caller persists to Convex File Storage). `openai` and `@fal-ai/client` deps removed; `openaiKey` + `falKey` dropped from schema/users/BYOK form/run-context. RunKeys is now 7 fields (was 9).
- **P7.5 — orchestrator becomes a Vercel Workflow** (commit `27183c6`). New `apps/parent-agent/src/workflows/run-generation.ts` with `'use workflow'` directive — one generation per call, durable. `runChild` is now a plain async function (no Tensorlake `fn()` wrapper). `orchestrator.ts` is now a thin local-dev entrypoint that fires one generation given `ACTING_USER_ID`. Cron schedule deferred to P7.7. Children are still in-process for now (P7.6 splits into ship + measure workflows).
- **P7.6 — runHypothesis becomes a Vercel workflow over durable `sleep('60m')`** (commit `7aff376`). New `workflows/run-hypothesis.ts` (`'use workflow'`) replaces `child.ts`. Body extracted into `workflows/steps/hypothesis-steps.ts` (`'use step'`): setup → ship → kickTraffic → sleep → measureAndFinalize → rollbackOnCrash. Each step re-hydrates BYOK keys via `withUserCtx(actingUserId)` because AsyncLocalStorage doesn't survive step replay. `child.ts` deleted. Simpler than the agent's two-workflow split — Vercel's `sleep()` is itself durable, no need to fragment into ship + measure runs.
- **P7.7 — dashboard trigger + docs sweep** (commit `c65e8da`). `/console` gains a "Run a generation" button → `POST /api/workflows/trigger` (Clerk-auth, looks up `users:current`, returns 501 + the local-dev command until Vercel workflow runtime is enabled at deploy). AGENTS.md Shape paragraph + pinned-stack table + invariant #7 + new BYOK section reflect Vercel Workflows + AI Gateway. Landing page stack chips: Tensorlake/gpt-image-2/FLUX 2 Pro out → Vercel Workflows / AI Gateway / Clerk / FLUX 2 / Gemini 3 Pro Image in.

## P7 complete (2026-05-09)

Vercel-all-in pivot done. Tensorlake stub removed; durable orchestration is Vercel Workflows; LLM + image gen is Vercel AI Gateway with one user-provided key. Platform's BYOK list is now: aiGatewayKey, exaKey, browserbaseKey, resendKey, reacherKey, niaKey, cloudflareKey. Operator only pays for: Stripe (Connect of-record), Convex, Vercel (hosting + workflows), Clerk, JWT keypair, apex domain.

### Smoke-test post-P7

1. `pnpm --filter @autoresearch/dashboard --filter convex dev` boots cleanly
2. Sign up via Clerk, BYOK form shows AI Gateway + Exa fields
3. `/console` "Run a generation" button → returns 501 with the local-dev hint
4. Locally: `ACTING_USER_ID=<uid> pnpm --filter @autoresearch/parent-agent dev` — orchestrator entrypoint fires `runGeneration` once
5. (Deferred) wire `start(runGeneration)` once Vercel workflow runtime + plugin are configured on the deployment

### Known follow-ups (out of P7)

- Pre-existing TS errors in propose.ts, lessons.ts, revenue.ts, llm.ts, stripe.ts (unrelated to pivot — separate cleanup pass)
- Cron schedule for `runGeneration` (`vercel.json` `crons` entry pointing at a route that calls `start()`) — deferred for hackathon, button is sufficient
- Encrypt BYOK keys at rest (hackathon scope: plaintext)

## P7.8 — collapse parent-agent into dashboard (2026-05-09, commit `77c6903`)

Why: Vercel Workflows only sees code inside the deployed Next.js host. With workflows in `apps/parent-agent/`, the dashboard couldn't `import { runGeneration } from ...` and `start()` had no function to enqueue.

What moved: `apps/parent-agent/src/*` → `apps/dashboard/agent/*` (budget, revenue, propose, select, lessons, run-context, env, tools/*, workflows/*). `apps/parent-agent/` deleted.

Trigger route: `/api/workflows/trigger` now does the real `start(runGeneration, [me._id])` from `workflow/api` and returns `{ runId }`. No 501 placeholder.

Side fixes: exa tool moves to BYOK `getKey('exa')`. Browserbase project ID + Cloudflare zone ID read from `process.env` directly (they were dropped from the validated env schema in P7.2 because they're optional/platform-deployment specific).

## P7.9 — drop Cloudflare, use `*.team.vercel.app` (2026-05-09, commit `c2d965a`)

Why: For hackathon scope, Vercel issues wildcard SSL automatically on `*.<team>.vercel.app` (or `*.<user>.vercel.app` on hobby) per [community#475](https://github.com/vercel/community/discussions/475). No DNS upsert per tenant; one wildcard config in project settings covers every `exp-XXXXXX.<APEX_DOMAIN>`.

What dies: `apps/dashboard/agent/tools/cloudflare.ts`, `cloudflareKey` BYOK (RunKeys + schema + users + byok-form), `getCloudflareToken()`, `cloudflare_call` audit kind, `CLOUDFLARE_*` env entries.

`APEX_DOMAIN` semantic preserved — value flips from a real apex to `<team>.vercel.app`. Storefront URL pattern `https://${subdomain}.${APEX_DOMAIN}` is unchanged. The "graduate winner to a custom apex" feature (Cloudflare registrar) is a future P9, not hackathon scope.

## P7.10 — drop Browserbase, run agent-browser in Vercel Sandbox (2026-05-09, commit `4df064a`)

Why: `vercel-labs/agent-browser` purpose-built for AI agents (~93% token reduction vs raw Playwright via accessibility-tree snapshots) runs inside `@vercel/sandbox` microVM. Authentication uses the platform's Vercel OIDC token at runtime — no per-user BYOK key.

Tradeoff: Sandbox CPU usage now bills the platform's Vercel account, not the user. Hobby includes 5 free CPU-hours/month; Pro is $0.128/hr. This is a deliberate exception to "user provides every key the agent burns" — there's no BYOK knob for a Vercel team. At scale this is a real cost, but for hackathon hobby tier it's free.

What dies: `apps/dashboard/agent/tools/browserbase.ts`, `browserbaseKey` BYOK, `BROWSERBASE_*` env entries.
What's new: `apps/dashboard/agent/tools/agent-browser.ts` wraps `Sandbox.create({ runtime: "node24" })` + `npx -y agent-browser <cmd>`. Audit kind `browserbase_session` → `sandbox_session`; budget kind `browserbase` → `sandbox`.

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

## P8 — TikTok-Shop pivot for hackathon submission (2026-05-09)

Pivot from "agent generates a digital product" → "agent hypothesis-tests real physical products on TikTok Shop with a demo-safe refund-all settlement". The artifact is the upstream conversion signal, not the order.

- **P8.1 — schema pivot, physical products** (commit `dc615b0`). `Hypothesis` shape gains `productSource` (Temu/Alibaba marketplace + scrape candidates) and `adCreativeStorageIds`; loses `deliverableKind`. `format` → `category` rename (PhysicalCategorySchema). Tenants table denormalizes `displayCopy` + `displayPriceUsd` so the storefront renders from a single `bySubdomain` query.
- **P8.2 — strip Exa** (commit `0f1d75c`). Reacher + Nia are sufficient for niche discovery; Exa retired from BYOK + run-context + tools + landing copy.
- **P8.3 — Nia MCP tool** (commit `2356583`). Mirror of `reacher.ts` pattern using `@modelcontextprotocol/sdk` + `StreamableHTTPClientTransport`. Wraps `nia_deep_research_agent` (Oracle) and `nia_package_search_hybrid` (corpus).
- **P8.4 — Reacher into propose** (commit `5c40f93`). `fetchNichePool()` calls Reacher's TikTok-Shop trending endpoint; `SEED_NICHES` retired. Backstop is a single-entry array — if you see it, the live signal is broken.
- **P8.5 — Nia Oracle into propose + lessons** (commit `eae6ac6`). `fetchNiaPriors(nichePool)` adds research grounding to each generation's prompt. `indexLessonsToNia()` fire-and-forget pushes distilled lessons back into the Nia corpus for future generations.
- **P8.6 — Temu scout step** (commit `1787ef2`). `scoutProductSource()` runs `agent-browser` inside Vercel Sandbox against Temu's search results, then has Sonnet pick a single product from the accessibility tree.
- **P8.7 — persist scraped images** (commit `97a6267`). `persistScrapedImages()` downloads candidate URLs into Convex File Storage so storefront + image-gen have permanent references.
- **P8.8 — re-skin scraped photos via FLUX** (commit `31e9c34`). `generateAdCreatives()` runs FLUX 2 (Gemini 3 Pro Image fallback) to turn one scraped product photo into hero + gallery shots. Stored to Convex File Storage alongside the scrapes.
- **P8.9 — storefronts render hypothesis copy + creatives** (commit `21feea6`). Tenants page rewritten to render `tenant.displayCopy` + `tenant.adCreativeStorageIds` end-to-end; the deliver route is stubbed `410 Gone`.
- **P8.10 — refund-all settlement + apology email** (commit `6b67ae2`). Storefront `stripe-webhook` POST adds `settleDemoOrder()` that refunds the just-completed Checkout via the connected account and emails the customer via the operator's Resend BYOK. New `tenants:ownerSettlementInfo` query (stripe-webhook identity only).
- **P8.11 — operator cancel + force-refund** (commit `6b6f9fa`). New `tenants:cancelByOwner` + `tenants:operatorContext` (requireUser + ownership). Two API routes (`/api/operator/cancel/[subdomain]`, `/api/operator/force-refund/[subdomain]`) with server-side ownership re-check. Force-refund sweeps PaymentIntents on the connected account by `metadata.tenantSubdomain` and catches `charge_already_refunded` as `skipped`. New `TenantsPanel` component on `/console`.
- **P8.12 — explore/exploit slider** (commit `b791288`). Per-user `exploitFraction` field (default 0.7). Slider on `/console/settings/keys`. propose() reads via `users:runSettingsForUser` at the top of each generation; near/far split of the explore remainder stays 2:1.
- **P8.13 — realtime agent log stream** (commit `a26864d`). New `agentEvents` table (per-user, indexed by_user_time). `recordAgentEvent()` helper wired into propose start, setupExperiment, scout found, tenant live, measure verdict, generation end, crash. New `AgentLogStream` component on `/console` tails via Convex `useQuery`.
- **P8.14 — anonymized network ticker on landing** (commit `aa295e4`). New public `dashboard:globalAnonStats` (no token). New `LiveRevenueTicker` with green-pulse animation when grossCharged ticks up; replaces the old per-platform DollarTicker on `/`.
- **P8.15 — landing rewrite for hackathon** (commit `13b2dd8`). Hero leads with TikTok-Shop hypothesis testing; loop expanded to five phases (Hypothesize/Scout/Ship/Measure/Settle); new operator-controls section calls out the live stream + kill/refund + slider; stack copy names Reacher and Nia explicitly.
- **P8.16 — AGENTS.md + STATUS.md narrative refresh** (this commit). Shape paragraph reframed for the pivot (TikTok Shop, demo-safe settlement, four-key BYOK list); paths updated from `apps/parent-agent/*` to `apps/dashboard/agent/*` (P7.8 collapse already happened); operator-controls + demo-safe-settlement sections added.

### Pre-existing tech debt (not P8 work)

- `apps/dashboard/agent/budget.ts` and `revenue.ts` typecheck errors against newer Convex generic types. Both are immutable substrate; deferred.
- `apps/dashboard/agent/tools/llm.ts` AI SDK schema generic mismatch (also pre-P8).
- `apps/dashboard/agent/tools/stripe.ts` Stripe `apiVersion` literal mismatch ("clover" vs older "basil"). Cosmetic; runtime fine.
- `convex/_generated/api.d.ts` is gitignored; running `convex codegen` (or `convex dev`) regenerates the entries for new modules (`agentEvents` was hand-stitched locally for typecheck after P8.13).

## Notes

- Identity is now RS256. `packages/auth/src/secret.ts` exports `loadPrivateKey()` / `loadPublicKey()`. `convex/_lib/identity.ts` reads `AUTH_JWT_PUBLIC_KEY` (base64 PEM) from Convex env, decodes via `atob` (no Buffer in Convex runtime).
- AGENTS.md invariant #8 ("Not Clerk") will be reworded in P6 — Clerk for human sessions, custom JWT for service identities.
- Hackathon scope: no signup gate, no encryption on stored API keys (plaintext on user row), no platform fee.
