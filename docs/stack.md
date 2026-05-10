# Stack & Architecture

> Status: design draft for senior-engineer review. Critique freely.
>
> This document defines the runtime topology, language choices, data ownership,
> failure model, and deployment story for an autonomous agent whose terminal
> goal is `maximize $ in Stripe balance`. It assumes the harness pattern
> defined in `docs/harness.md` (Karpathy-derived autodrop loop) and does
> not re-litigate that.

---

## 1. The shape, in one paragraph

A **single TypeScript monorepo**. One always-on **Tensorlake `@application`** is
the agent body — it spawns parallel **Tensorlake `@function` children**, one
per hypothesis. Each child generates a product, deploys it as a tenant in a
**multi-tenant Next.js app on Vercel** (one project, subdomain-routed,
hundreds of tenants), creates a **Stripe payment link** via the Stripe Agent
Toolkit, and drives traffic. **Convex** is the canonical store for tenants,
experiments, ledger, and lessons; it is also the realtime backbone for the
human-facing **dashboard** (a second Next.js app on Vercel). **Stripe webhooks**
land at Vercel API routes which forward into Convex. Three external sense
organs (**Reacher MCP**, **Nia MCP**, **Exa**) feed the hypothesis generator.
Three external hands (**Browserbase**, **Resend**, **Cloudflare API**) let the
agent take actions outside the closed loop.

```
                          ┌─────────────────┐
                          │   Stripe API    │
                          └────────┬────────┘
                                   │ webhook (charge / refund)
                                   ▼
   ┌──────────────────┐      ┌──────────────────┐
   │ End customers    │─────▶│  Vercel: edge    │
   │ (browsers, ads)  │ HTTP │  multi-tenant    │
   └──────────────────┘      │  storefronts     │
                             └─────────┬────────┘
                                       │ tenant lookup, webhook ingest
                                       ▼
                              ┌──────────────────┐
                              │     Convex       │◀──────────────┐
                              │ (tenants, exps,  │               │ writes
                              │  ledger, lessons)│               │ results
                              └────────┬─────────┘               │
                                       │ realtime sub            │
                                       ▼                         │
                              ┌──────────────────┐               │
                              │ Vercel: dashboard│               │
                              │ (live $ ticker)  │               │
                              └──────────────────┘               │
                                                                 │
   ┌─────────────────┐         ┌──────────────────┐              │
   │ Reacher MCP     │◀────────│ Tensorlake       │──────────────┘
   │ Nia MCP         │   read  │ parent (1)       │
   │ Exa             │         │ children (N≤8)   │
   └─────────────────┘         │ TypeScript       │ ──┐
   ┌─────────────────┐         └─────────┬────────┘   │
   │ Browserbase     │◀────────          │            │
   │ Resend          │   write           ▼            ▼
   │ Cloudflare API  │            ┌──────────────┐  ┌──────────────┐
   └─────────────────┘            │ Stripe API   │  │ Vercel API   │
                                  │ (Agent Kit)  │  │ (deployments)│
                                  └──────────────┘  └──────────────┘
```

---

## 2. Language and runtime

**TypeScript everywhere.** One language across:

- `apps/parent-agent` — Tensorlake `@application` and `@function`
- `apps/storefronts` — Next.js (App Router) on Vercel
- `apps/dashboard` — Next.js on Vercel
- `convex/` — Convex server functions
- `packages/*` — shared types, schemas, prompts, deliverable generators

Why TS, not Python:

| Concern | Verdict |
|---|---|
| Vercel + Next.js | TS-native. Python adds friction. |
| Convex | TS-first; the Python client is second-class. Schema → TS types is the path. |
| Stripe Agent Toolkit | First-class in TS via `@stripe/agent-toolkit/ai-sdk` (Vercel AI SDK integration). Python toolkit exists but the `ai-sdk` integration is the simplest path. |
| Tensorlake | Both SDKs supported; TS is fine. |
| LLM SDKs (Anthropic, OpenAI) | Both supported. |
| MCP clients (Reacher, Nia) | Both. |
| Browser automation (Browserbase) | Both, idiomatic in TS. |
| One-language monorepo | Reduces context switching, single typecheck, shared schemas at compile time. |

The only place we'd consider Python: scientific/data libs we don't actually
need (`pandas`, `scikit`). For Bayesian updates we'll use a small TS
implementation (`lib/bandit.ts`); a Beta-Bernoulli posterior is ~30 lines.

**Runtime**: Node 22 LTS, TypeScript 5.6, `pnpm` workspaces, **Turborepo** for
caching. ESM only (`"type": "module"`). `tsx` for running TS directly in
sandboxes; production builds via `tsc` or `esbuild` per app.

---

## 3. Repository layout

```
.
├── apps/
│   ├── parent-agent/           # Tensorlake — the agent body
│   │   ├── src/
│   │   │   ├── orchestrator.ts        # @application — main loop
│   │   │   ├── child.ts               # @function — one hypothesis
│   │   │   ├── propose.ts             # hypothesis generation (LLM + Nia + Reacher + Exa)
│   │   │   ├── select.ts              # Bayesian selection / Thompson sampling
│   │   │   ├── lessons.ts             # distill outcomes → lessons.md
│   │   │   ├── budget.ts              # IMMUTABLE budget guardrails
│   │   │   ├── revenue.ts             # IMMUTABLE measurement helpers
│   │   │   ├── tools/
│   │   │   │   ├── stripe.ts          # Agent Toolkit wrapper
│   │   │   │   ├── vercel.ts          # deploy/domain helpers (no per-tenant deploy)
│   │   │   │   ├── convex-client.ts   # parent-agent → Convex
│   │   │   │   ├── reacher.ts         # MCP client
│   │   │   │   ├── nia.ts             # MCP client
│   │   │   │   ├── exa.ts
│   │   │   │   ├── browserbase.ts
│   │   │   │   ├── resend.ts
│   │   │   │   ├── images.ts          # gpt-image-2 primary, FLUX 2 Pro fallback
│   │   │   │   └── deliverables/      # PDF/JSON/MD/ZIP generators
│   │   │   └── program.md             # the agent's "skill"
│   │   ├── tensorlake.config.ts
│   │   └── package.json
│   │
│   ├── storefronts/             # Next.js — multi-tenant storefronts
│   │   ├── app/
│   │   │   ├── _sites/[domain]/page.tsx       # rendered tenant page
│   │   │   ├── api/checkout/route.ts          # creates Checkout Session
│   │   │   ├── api/stripe-webhook/route.ts    # webhook → Convex
│   │   │   └── api/deliver/[token]/route.ts   # post-purchase delivery
│   │   ├── middleware.ts                      # subdomain → tenant rewrite
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── dashboard/               # Next.js — human-facing live dashboard
│       ├── app/page.tsx
│       └── package.json
│
├── packages/
│   ├── schemas/                 # Zod schemas (Hypothesis, Tenant, Experiment, …)
│   ├── prompts/                 # versioned prompt templates
│   ├── bandit/                  # Beta-Bernoulli + Thompson sampling
│   ├── deliverables/            # PDF/JSON/MD generators (pure functions)
│   └── shared/                  # logger, env loader, etc.
│
├── convex/                      # Convex backend
│   ├── _generated/              # checked-in
│   ├── schema.ts
│   ├── tenants.ts
│   ├── experiments.ts
│   ├── ledger.ts                # IMMUTABLE webhook ingester
│   ├── lessons.ts
│   ├── budget.ts                # IMMUTABLE budget singleton
│   └── http.ts
│
├── docs/
│   ├── stack.md                 # this file
│   ├── harness.md               # the program.md / skill / loop spec
│   └── runbook.md               # ops + kill-switch playbook
│
├── infra/
│   └── env.example
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Hard rule: `apps/parent-agent/src/{budget,revenue}.ts` and
`convex/{ledger,budget}.ts` are **read-only to the agent**. Enforced by:
1. Convention (the program.md skill says do not edit)
2. CODEOWNERS — only humans approve PRs touching them
3. The Tensorlake child sandbox does not have write access to those paths in
   the cloned repo (mounted read-only)

This is the direct analog of Karpathy's `prepare.py`.

---

## 4. Service responsibilities

### 4.1 Tensorlake — agent body (1 parent + N children)

**Parent (`@application`)**
- Lifecycle: long-lived, restarts from snapshot on crash
- State: durable FS at `/agent/` (identity, current generation, in-flight experiments)
- Loop: read state → propose batch → fan out children → wait → collect → update Convex → write lessons → snapshot
- Concurrency: 1 instance, singleton

**Child (`@function`)**
- Lifecycle: spawned per hypothesis, dies after 60–90 min
- State: ephemeral sandbox FS, results written to Convex via API
- Tools: Stripe Agent Toolkit, Vercel API, Convex API, Browserbase, Resend, Reacher/Nia/Exa, deliverable generators
- Concurrency: ≤8 in parallel per generation (Tensorlake quota)

Why separate parent and children:
- Parent should not crash from a child's deploy failure or LLM nondeterminism.
- Children get clean isolated environments per experiment (separate API keys
  by purpose, separate Browserbase sessions, no cross-contamination).
- Tensorlake's snapshot/fork primitives let a child be re-run from its
  starting state if a transient failure occurs.

### 4.2 Convex — state of the world

**Source of truth for**: tenants, experiments, ledger events, lessons, budget
singleton, budget reservations.

**Why Convex over Postgres + Redis + websockets:**
- Realtime subs are first-class — the dashboard becomes a 30-line component.
- Server functions are TS, share types with the rest of the monorepo.
- Webhook → DB → subscribers fan-out is one server function, no Pub/Sub.
- Free tier handles our scale (hundreds of writes/min peak).

**Trade-off**: vendor lock-in. Mitigated by keeping schemas in
`packages/schemas` (Zod) — Convex tables are projections of those.

#### 4.2.1 Capability model — caller-identity ACLs (NOT deploy-key scopes)

Convex deploy keys deploy code; they do not enforce row-level runtime ACLs.
Capabilities must be enforced **inside each Convex function** based on the
caller's identity. We use distinct service identities, each with its own
short-lived auth token issued at boot:

| Identity | Allowed mutations | Forbidden |
|---|---|---|
| `agent` (parent + children) | `tenants:create/pause/kill`, `experiments:create/update`, `lessons:write`, `budget:reserve/release` | `budgetState:*`, `ledgerEvents:insert`, `auditLog:insert` (insert is by other identities) |
| `stripe-webhook` | `ledgerEvents:insert` (with `payment_status` precondition), `experiments:updateRevenue` | everything else |
| `refund-worker` | `ledgerEvents:insertRefund`, `experiments:markRefunded` | everything else |
| `dashboard` | read-only on all tables | all writes |
| `admin` (human) | full | none — used for migrations and `budgetState` edits |

Implementation: each function begins with
`const id = await requireIdentity(ctx, ["agent"])`. Identities are issued via
the Convex auth integration (Clerk or a small custom JWT issuer). The token
the agent sandbox holds is **scoped to `agent`**; it physically cannot mint
mutations from a privileged role. This is the layer reviewer P0 #4 flagged
as missing — deploy keys do not give us this.

### 4.3 Vercel — public traffic surface

**Two separate Vercel projects:**
1. `storefronts` — multi-tenant Next.js. Wildcard `*.<our-domain>.com`. Edge-rendered.
2. `dashboard` — auth-walled (Clerk or basic basic-auth) live ops view.

**Multi-tenant pattern** (canonical):
- Wildcard CNAME `*.<our-domain>.com → cname.vercel-dns.com`.
- Vercel project has `*.<our-domain>.com` registered.
- `middleware.ts` reads `host`, extracts subdomain, rewrites
  `/_sites/[subdomain]/...`. The `_sites` segment is internal-only.
- `app/_sites/[domain]/page.tsx` reads tenant config from Convex by
  subdomain (with `cache: "force-cache"` and Convex's revalidation primitives).
- Adding a tenant = `INSERT INTO tenants` in Convex. Zero deploys.

**Custom domain promotion** (when a winning tenant graduates):
1. Agent buys domain via Cloudflare API.
2. Agent calls Vercel API: `POST /v9/projects/{id}/domains` to add domain
   to `storefronts` project.
3. Agent updates the tenant row to set `customDomain`.
4. Vercel issues TLS automatically.

### 4.4 Stripe — money rails

**Surface 1 only** for v1: Stripe Checkout via Agent Toolkit. ACP and MPP
are out of scope for now (see `docs/runbook.md` for upgrade path).

#### 4.4.1 Why Checkout Sessions, not Payment Links

Reviewer P0 #5 surfaced a real attribution and accounting bug. We resolve it
by avoiding the Payment Link primitive entirely:

- **Payment Links are reusable**, so a single click → completion does not
  uniquely identify *which experiment* drove the conversion. Multiple
  experiments could share a Payment Link by accident, and per-click tagging
  is awkward.
- **Checkout Sessions** are created per click, and accept a
  `client_reference_id` (which we set to `experimentId`) plus a `metadata`
  object (`{ experimentId, hypothesisId, tenantSubdomain, generation }`).
  Attribution is exact.

Flow:
1. Agent (child function) creates `Product` + `Price` only — no Payment Link.
2. Tenant row stores `stripeProductId` and `stripePriceId`.
3. Storefront `/api/checkout` route, on customer click, creates a Checkout
   Session with the price ID, `client_reference_id = experimentId`, and
   metadata. Returns the Session URL; client redirects.
4. Webhook receives session events keyed by that experiment ID.

#### 4.4.2 Restricted key scope (`rk_test_*` then `rk_live_*`)

Agent's key:
- `products.create`
- `prices.create`
- `checkout.sessions.create` *(used by storefront checkout route, see §10.1
  for token isolation)*
- `checkout.sessions.read`
- `events.read` (for reconciliation when webhook delayed)
- Nothing else. Specifically NOT: refunds, transfers, customers.write,
  any `*.update` or `*.delete` actions.

Note from reviewer P1 #6: Stripe restricted keys are resource-level, not
action-level. They give us a blast-radius limit, not enforcement of
"create-only." The hard enforcement of "no updates, no refunds" is in our
**Stripe action allowlist** layer (§10.2) — a fixed list of permitted
`stripe.*` method calls validated outside the LLM prompt.

#### 4.4.3 Revenue-recognition rule (P0 #5 fix)

Revenue is **only** booked into `ledgerEvents` when:

1. The webhook event is `checkout.session.completed`
   AND `session.payment_status === "paid"`, OR
2. The webhook event is `checkout.session.async_payment_succeeded`.

A `checkout.session.completed` event with `payment_status === "unpaid"` or
`"no_payment_required"` is logged to `auditLog` for traceability but does
**not** create a `ledgerEvent`. Async payment failures
(`checkout.session.async_payment_failed`) mark the experiment with a
`asyncFailure` flag for selection logic to discount.

#### 4.4.4 Webhook setup

- Endpoint: `https://storefronts.<apex>/api/stripe-webhook`
- Events subscribed:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
- Signing secret in Vercel env, **not** in agent sandbox. The agent never
  sees the raw webhook stream — it only reads digested `ledgerEvents` from
  Convex via the `agent` identity (read-only on `ledgerEvents`).

### 4.5 External sense organs

**Reacher MCP** (`api.reacherapp.com/mcp`)
- Use: trend signal, creator data, GMV time series for niche selection
- Pattern: parent invokes during `propose()` to bias hypothesis buckets toward
  niches with rising commerce activity
- Constraint: **writes are sandboxed** — `POST /samples/request` and
  `POST /outreach/draft` do not actually dispatch. Treat as logging.

**Nia MCP**
- Use: curated corpus of "what sells online" — IndieHackers, Starter Story,
  niche newsletter monetization breakdowns, competitor product pages
- Pattern: parent calls `nia.search(...)` during `propose()` to ground
  hypotheses in priors instead of GPT confabulations
- Setup cost: index ~1000 documents at start of run. One-time.

**Exa**
- Use: live web search for current state of the world ("what's trending
  on HN right now in [niche]?")
- Pattern: child calls during hypothesis execution if it needs fresh context

### 4.6 External hands

**Browserbase**
- Use: any UI-only action — signing up for a service, posting on a platform
  without an API, scraping a logged-in surface
- Pattern: child opens a session per task, screenshots for debugging,
  closes session
- Cost: roughly $0.05 per 5-min session. Cap at $5/generation.

**Resend**
- Use: cold email with proper SPF/DKIM. Each "channel = cold_email"
  hypothesis sends ≤200 emails to a *curated, owner-provided* list
- Hard rule: agent **cannot** scrape and email arbitrary addresses. The
  list of permissible recipients lives in `convex.permittedAudiences` and
  is human-curated.

**Cloudflare API**
- Use: register domains, manage DNS for promoted tenants
- Scope: token limited to `Zone:Edit` for one zone

### 4.7 Image generation — `gpt-image-2` primary, FLUX 2 Pro fallback

The agent generates marketing assets per hypothesis: landing-page hero images,
digital-product cover art, and static ad creative. Video/voiceover are out of
scope for v1 (cost ceiling and demo-window mismatch).

**Primary**: OpenAI `gpt-image-2` (released 2026-04-21, replaces DALL-E 3
which retires 2026-05-12).

- Model ID: `gpt-image-2`
- Pinned snapshot: `gpt-image-2-2026-04-21` (defaults drift; pin in code)
- Endpoint: `client.images.generate(...)` from the official `openai` npm
  package
- Modalities: text → image, **and** text+image → image (edits in same model)
- Output sizes: 1024×1024, 1024×1536, 1536×1024, up to 2048×2048 (custom
  dimensions supported)
- Native text rendering: strong enough that we use it for both hero images
  and cover art with text overlays. Skip Ideogram unless it disappoints in
  practice.
- Cost: ~$0.04 / 1024² standard, ~$0.10–0.15 / 2K, up to ~$0.35 for complex
  high-res prompts. Token-based underneath ($5/1M text in, $8/1M image in,
  $30/1M image out). Batch API halves the rate.
- Rate limit: **5 images/minute at Tier 1**, scaling to ~50 at Tier 2 and
  250 at higher tiers. OpenAI auto-tiers on cumulative spend; expect Tier 2
  within ~1 day of real usage.
- Constraints: no streaming, no function calling on image endpoint, output
  URLs expire ~1 hour (download-and-upload to our storage immediately).

**Fallback**: Black Forest Labs **FLUX 2 Pro** via fal.ai
(`@fal-ai/client`). Used when:
- gpt-image-2 returns a content-policy refusal (its filter is strict on
  health, finance, supplements, some apparel)
- Tier 1 rate limit is saturated and a child is generating in parallel
- A specific niche empirically converts better with FLUX's photoreal style

Cost: ~$0.055/image, sub-10s latency. Same TS code shape as fal calls
elsewhere.

**Ad-platform safety pattern**: Meta and Google increasingly fingerprint
pure AI imagery and reject it under "low-quality / misleading" policies.
For ad creative specifically, the pipeline is:

```
gpt-image-2 → background-only image (no text)
    ↓
Bannerbear (or Placid) template API → composites
    - logo (deterministic asset)
    - CTA button + headline (rendered as actual text, not pixels)
    - brand-colored frame
    ↓
final ad creative uploaded to Meta / Google
```

For hero images and cover art (not paid-ad surfaces), composition isn't
needed — gpt-image-2 output goes straight to the tenant page.

**Asset costs roll into the per-experiment budget reservation** (§5.7).
Without this, an experiment can quietly burn $5+ in image generation
*before* it ever drives traffic. The `budget:reserve` call in `runChild`
must include an `assetBudget` field; image generations report into it via
`budget:reportSpend({ kind: "asset_gen" })`.

**Implementation shape**:

```ts
// apps/parent-agent/src/tools/images.ts
import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { reportAssetSpend } from "./budget.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
fal.config({ credentials: process.env.FAL_API_KEY! });

export async function generateImage({
  reservationId, prompt, size = "1024x1024", purpose,
}: GenImageArgs): Promise<{ url: string; provider: string; costUsd: number }> {
  try {
    const r = await openai.images.generate({
      model: "gpt-image-2-2026-04-21",
      prompt, n: 1, size,
    });
    const cost = estimateGptImageCost(size);
    await reportAssetSpend(reservationId, cost);
    return { url: await persistToStorage(r.data[0].url!), provider: "openai", costUsd: cost };
  } catch (err) {
    if (!isPolicyOrRateLimitError(err)) throw err;
    // Fallback to FLUX 2 Pro via fal
    const r = await fal.run("fal-ai/flux-pro/v2", { input: { prompt, image_size: size } });
    await reportAssetSpend(reservationId, 0.055);
    return { url: await persistToStorage(r.data.images[0].url), provider: "flux2pro", costUsd: 0.055 };
  }
}
```

`persistToStorage` downloads the (expiring) URL and re-uploads to a
bucket we control (Convex file storage or a Cloudflare R2 bucket — TBD,
see §12). Tenant rows reference our persistent URL, never OpenAI's
expiring one.

---

## 5. Data model

All schemas in `packages/schemas` (Zod). Convex tables are projections.

### 5.1 Hypothesis (in-memory, becomes Tenant + Experiment)

```ts
export const HypothesisSchema = z.object({
  id: z.string(),                          // ulid
  generation: z.number().int(),
  parentId: z.string().nullable(),         // for mutations
  bucket: z.object({                       // for Thompson sampling
    niche: z.string(),
    format: z.enum(["report", "critique", "pack", "directory", "audit", "generator"]),
    priceTier: z.enum(["1-5", "6-15", "16-30", "31-99"]),
    channel: z.enum(["google_ads", "meta_ads", "x_organic", "reddit", "cold_email", "tiktok_organic", "owned_audience"]),
  }),
  copy: z.object({
    headline: z.string().max(80),
    subhead: z.string().max(200),
    bullets: z.array(z.string().max(120)).max(5),
    cta: z.string().max(40),
  }),
  price: z.number().int().min(1).max(99),  // USD whole dollars
  deliverable: z.object({
    kind: z.enum(["pdf", "json", "md", "zip"]),
    spec: z.unknown(),                     // generator-specific schema
  }),
  trafficPlan: z.object({
    channel: z.string(),
    budgetUsd: z.number().max(20),         // hard cap; any higher is rejected
  }),
  rationale: z.string().max(500),          // agent's stated reason — mandatory
});
```

**Note**: `rationale` is required. Karpathy's lesson: when the agent has
to articulate *why*, the lessons.md output is dramatically more useful for
future generations. This is a cheap correctness lever.

### 5.2 Tenant (Convex `tenants` table)

```ts
defineTable({
  subdomain: v.string(),
  hypothesisId: v.string(),
  stripeProductId: v.string(),
  stripePriceId: v.string(),               // Sessions created per click against this price
  deliverableKind: v.string(),
  deliverableSpec: v.any(),                // for re-generation on demand
  customDomain: v.optional(v.string()),
  status: v.union(v.literal("live"), v.literal("paused"), v.literal("killed")),
  createdAt: v.number(),
}).index("by_subdomain", ["subdomain"])
  .index("by_hypothesis", ["hypothesisId"])
  .index("by_status", ["status"]);
```

Note the absence of `stripePaymentLinkId`. We do not use Payment Links;
attribution requires per-click Checkout Sessions (see §4.4.1).

### 5.3 Experiment (Convex `experiments` table — append-only-ish)

```ts
defineTable({
  hypothesisId: v.string(),
  generation: v.number(),
  parentId: v.optional(v.string()),
  bucket: v.object({
    niche: v.string(), format: v.string(), priceTier: v.string(), channel: v.string(),
  }),
  spendUsd: v.number(),                    // updated as ad spend reports in
  revenueUsd: v.number(),                  // updated as charges land
  visitors: v.number(),
  conversions: v.number(),
  roasMean: v.optional(v.number()),
  roasLower: v.optional(v.number()),       // 5th percentile, Beta posterior
  roasUpper: v.optional(v.number()),       // 95th percentile
  status: v.union(
    v.literal("pending"),                  // running, no decision yet
    v.literal("keep"),                     // ROAS lower bound > 1.0 → breed
    v.literal("refine"),                   // ROAS mean ∈ [0.5, 1.0] → mutate one variable
    v.literal("discard"),                  // ROAS upper < 0.5 → kill
    v.literal("crash"),                    // execution failed
  ),
  startedAt: v.number(),
  decidedAt: v.optional(v.number()),
  notes: v.string(),
  rationale: v.string(),                   // copied from Hypothesis at start
}).index("by_status", ["status"])
  .index("by_generation", ["generation"])
  .index("by_bucket", ["bucket.niche", "bucket.format", "bucket.channel"]);
```

### 5.4 LedgerEvent (Convex `ledgerEvents` table — append-only)

```ts
defineTable({
  type: v.union(v.literal("charge"), v.literal("refund"), v.literal("ad_spend")),
  amountUsd: v.number(),                   // signed: charges +, refunds -, spend -
  tenantId: v.optional(v.string()),
  experimentId: v.optional(v.string()),
  stripeEventId: v.optional(v.string()),   // for idempotency
  paymentStatus: v.optional(v.string()),   // copied from Stripe; only "paid" reaches here
  source: v.string(),                      // "stripe_webhook" | "google_ads_api" | "manual"
  timestamp: v.number(),
}).index("by_stripe_event", ["stripeEventId"])
  .index("by_experiment", ["experimentId"])
  .index("by_timestamp", ["timestamp"]);
```

Idempotency: Stripe webhook handler checks `by_stripe_event` before insert.
Stripe replays are common.

**Insert preconditions** (enforced inside `ledger:recordCharge` mutation,
not just at the caller):
- caller identity must be `stripe-webhook` (see §4.2.1)
- `paymentStatus === "paid"` for `charge`-type rows
- `stripeEventId` not already present (idempotent)

A `checkout.session.completed` event with non-"paid" status does NOT produce
a `ledgerEvent` row — it lands in `auditLog` for diagnostic visibility only.

### 5.5 Lesson (Convex `lessons` table)

```ts
defineTable({
  generation: v.number(),
  scope: v.union(
    v.object({ kind: v.literal("bucket"),
               niche: v.string(), format: v.string(), priceTier: v.string(), channel: v.string() }),
    v.object({ kind: v.literal("global") }),
  ),
  pattern: v.string(),                     // free-form prose
  evidence: v.array(v.string()),           // experiment IDs supporting this
  weight: v.number(),                      // for time-decay; default 1.0
  createdAt: v.number(),
}).index("by_generation", ["generation"]);
```

Time-decay (per AutoResearchClaw): every generation, multiply `weight` of
all lessons by 0.92. Lessons with `weight < 0.1` get pruned.

### 5.6 BudgetState (Convex `budgetState` — singleton)

```ts
defineTable({
  perExperimentUsd: v.number(),            // 20
  perGenerationUsd: v.number(),            // 100
  perDayUsd: v.number(),                   // 500
  killSwitchHalt: v.boolean(),
  killSwitchReason: v.optional(v.string()),
});
```

Only writable by the `admin` identity (humans, via migration) or the
`budget-watchdog` identity (which can only set `killSwitchHalt = true`,
never raise limits — enforced inside the mutation). The `agent` identity
cannot mutate this table at all (§4.2.1).

### 5.7 BudgetReservation (Convex `budgetReservations` — atomic spend reservations)

This is the fix for reviewer P0 #3 (race-prone budget checks). Children
must atomically reserve from the budget *before* spending; reservations are
released or finalized when the experiment concludes.

```ts
defineTable({
  experimentId: v.string(),
  generation: v.number(),
  reservedUsd: v.number(),                 // committed at reserve time
  spentUsd: v.number(),                    // updated as ad-spend events land
  status: v.union(
    v.literal("active"),                   // reserved, may still spend
    v.literal("finalized"),                // experiment concluded; spentUsd is final
    v.literal("released"),                 // experiment crashed before spend; reservation freed
  ),
  reservedAt: v.number(),
  finalizedAt: v.optional(v.number()),
}).index("by_experiment", ["experimentId"])
  .index("by_generation_status", ["generation", "status"]);
```

The `budget:reserve` mutation runs as a Convex transaction:

```ts
// convex/budget.ts (excerpt — runs atomically)
export const reserve = mutation({
  args: { experimentId: v.string(), generation: v.number(), amountUsd: v.number() },
  handler: async (ctx, { experimentId, generation, amountUsd }) => {
    await requireIdentity(ctx, ["agent"]);

    const state = await ctx.db.query("budgetState").first();
    if (state.killSwitchHalt) throw new Error("HALTED");
    if (amountUsd > state.perExperimentUsd) throw new Error("PER_EXP_CAP");

    // Sum all active + finalized reservations in this generation
    const generationCommitted = await sumActiveAndFinalized(ctx, generation);
    if (generationCommitted + amountUsd > state.perGenerationUsd)
      throw new Error("PER_GEN_CAP");

    // Sum spent across all generations today
    const dayCommitted = await sumDayCommitted(ctx);
    if (dayCommitted + amountUsd > state.perDayUsd)
      throw new Error("PER_DAY_CAP");

    return await ctx.db.insert("budgetReservations", {
      experimentId, generation,
      reservedUsd: amountUsd, spentUsd: 0,
      status: "active", reservedAt: Date.now(),
    });
  },
});
```

Convex mutations are serializable — concurrent `reserve` calls cannot both
pass the cap check. This is the core mechanic that closes the TOCTOU window
the reviewer surfaced.

Children call `budget:reserve` **as their first action** in `runChild`,
before any external spend. If the reservation fails, the child aborts before
touching Stripe, Vercel, or any ad API. On success, the child carries the
reservation ID and reports actual spend back via `budget:reportSpend`
(which validates `spentUsd ≤ reservedUsd` inside the mutation). At
experiment conclusion, the child calls `budget:finalize` (sets `status =
"finalized"`) or `budget:release` (on crash, frees unused reserved budget
back to the cap).

---

## 6. The control loop

### 6.1 Parent loop (TypeScript)

```ts
// apps/parent-agent/src/orchestrator.ts
import { application, function as fn } from "@tensorlake/sdk";
import { propose } from "./propose.js";
import { runChild } from "./child.js";
import { selectAndClassify } from "./select.js";
import { distillLessons } from "./lessons.js";
import { checkBudget, killSwitchTripped } from "./budget.js";
import { convex } from "./tools/convex-client.js";

@application({ name: "autodrop-parent" })
export async function parent() {
  while (true) {
    const halted = await killSwitchTripped();
    if (halted) {
      await convex.mutation("system:awaitHumanAck");
      continue;
    }

    const generation = await convex.mutation("system:nextGeneration");
    const lessons = await convex.query("lessons:topWeighted", { limit: 50 });
    const liveTenants = await convex.query("tenants:byStatus", { status: "live" });

    const batchSize = await chooseBatchSize();         // typically 6–8
    const hypotheses = await propose({
      generation, lessons, liveTenants, batchSize,
    });

    // Schema-validate. NOTE: no aggregate budget pre-check here — that was
    // the race-prone pattern reviewer P0 #3 surfaced. Each child reserves
    // atomically from Convex inside runChild() (see §5.7).
    for (const h of hypotheses) HypothesisSchema.parse(h);

    // Fan-out children. Each one is its own Tensorlake sandbox. Children
    // that fail to reserve simply abort early without spending.
    const childPromises = hypotheses.map((h) => runChild(h));
    const outcomes = await Promise.allSettled(childPromises);

    // Bayesian classification
    for (const out of outcomes) {
      await selectAndClassify(out);
    }

    // Distill lessons (one LLM call across the whole generation)
    await distillLessons(generation);

    // Snapshot
    await convex.mutation("system:snapshotGeneration", { generation });
  }
}
```

### 6.2 Child function (TypeScript)

```ts
// apps/parent-agent/src/child.ts
import { function as fn } from "@tensorlake/sdk";
import { Hypothesis } from "@autodrop/schemas";
import { stripe } from "./tools/stripe.js";
import { vercel } from "./tools/vercel.js";
import { generateDeliverable } from "./tools/deliverables/index.js";
import { driveTraffic } from "./tools/traffic/index.js";
import { convex } from "./tools/convex-client.js";

@fn({ name: "run-hypothesis", timeout: "90m", memoryMb: 2048 })
export async function runChild(h: Hypothesis): Promise<ExperimentResult> {
  const expId = await convex.mutation("experiments:create", { hypothesis: h });
  let reservationId: string | null = null;

  try {
    // 1. ATOMIC budget reservation — must succeed before any external spend.
    //    Convex serializes this; concurrent reservations cannot both pass.
    reservationId = await convex.mutation("budget:reserve", {
      experimentId: expId,
      generation: h.generation,
      amountUsd: h.trafficPlan.budgetUsd,
    });

    // 2. Generate deliverable artifact (no money spent yet)
    const deliverableUrl = await generateDeliverable(h.deliverable);

    // 3. Create Stripe Product + Price (no Payment Link — sessions are
    //    created per click by the storefront so we can attach
    //    client_reference_id = experimentId for attribution)
    const { productId, priceId } = await stripe.createProductAndPrice({
      name: h.copy.headline, unitAmount: h.price * 100, currency: "usd",
    });

    // 4. Create tenant row → goes live instantly via multi-tenant middleware
    const subdomain = `exp-${h.id.slice(0, 8)}`;
    await convex.mutation("tenants:create", {
      subdomain, hypothesisId: h.id,
      stripeProductId: productId, stripePriceId: priceId,
      deliverableKind: h.deliverable.kind, deliverableSpec: h.deliverable.spec,
    });

    // 5. Drive traffic. Each spend call also reports back via
    //    budget:reportSpend (which validates spentUsd ≤ reservedUsd).
    await driveTraffic({
      channel: h.bucket.channel, tenantUrl: `https://${subdomain}.<apex>`,
      copy: h.copy, reservationId,
    });

    // 6. Wait for measurement window (60 min default)
    await sleep(60 * 60 * 1000);

    // 7. Collect metrics from Convex (only "paid" charges count — see §5.4)
    const metrics = await convex.query("experiments:metrics", { id: expId });

    // 8. Finalize reservation: locks spentUsd into the budget accounting
    await convex.mutation("budget:finalize", { reservationId });

    return { expId, metrics, status: "pending" };
  } catch (err) {
    // Release any unspent reserved budget so the cap isn't permanently held
    if (reservationId) {
      await convex.mutation("budget:release", { reservationId });
    }
    await convex.mutation("experiments:markCrashed", { id: expId, error: String(err) });
    return { expId, status: "crash", error: String(err) };
  }
}
```

### 6.3 Selection (Bayesian, lives in `select.ts`)

```ts
// packages/bandit/src/beta-bernoulli.ts
import { betaQuantile } from "./beta.js"; // tiny implementation

export function classifyROAS(spend: number, revenue: number, visitors: number, conversions: number) {
  if (visitors < 30) return "pending";   // not enough signal

  // Conversion rate posterior: Beta(α + conv, β + visitors - conv), prior Beta(1,1)
  const alpha = 1 + conversions;
  const beta  = 1 + (visitors - conversions);
  const cvrLower = betaQuantile(alpha, beta, 0.05);
  const cvrUpper = betaQuantile(alpha, beta, 0.95);

  // Revenue per conversion is empirical (price is fixed per hypothesis)
  const aov = conversions > 0 ? revenue / conversions : 0;

  // ROAS = (visitors × cvr × aov) / spend
  const roasLower = (visitors * cvrLower * aov) / spend;
  const roasUpper = (visitors * cvrUpper * aov) / spend;
  const roasMean  = ((alpha / (alpha + beta)) * visitors * aov) / spend;

  if (roasLower > 1.0)         return { status: "keep",    roasMean, roasLower, roasUpper };
  if (roasUpper < 0.5)         return { status: "discard", roasMean, roasLower, roasUpper };
  if (roasMean >= 0.5 && roasMean <= 1.0)
                               return { status: "refine",  roasMean, roasLower, roasUpper };
  return                              { status: "pending", roasMean, roasLower, roasUpper };
}
```

### 6.4 Hypothesis generation: Thompson sampling at the bucket level

```ts
// apps/parent-agent/src/propose.ts
export async function propose(args: ProposeArgs): Promise<Hypothesis[]> {
  // 1. Update bucket posteriors from prior experiments
  const bucketStats = await convex.query("experiments:bucketStats");

  // 2. Decide allocation across exploit / explore-near / explore-far
  const split = { exploit: 0.7, exploreNear: 0.2, exploreFar: 0.1 };
  const slots = allocateSlots(args.batchSize, split);

  // 3. Thompson sample buckets for exploit slots
  const exploitBuckets = thompsonSampleBuckets(bucketStats, slots.exploit);

  // 4. Combine "refine"-tier near-misses for explore-near
  const refineSeeds = await convex.query("experiments:byStatus", { status: "refine" });
  const exploreNearBuckets = recombine(refineSeeds, slots.exploreNear);

  // 5. Sample from Nia corpus for explore-far
  const exploreFarSeeds = await niaSearch("digital products under $50 with high conversion");

  // 6. LLM generates the actual hypothesis given the bucket + lessons
  const all = [...exploitBuckets, ...exploreNearBuckets, ...exploreFarSeeds];
  return Promise.all(all.map((seed) => llmGenerate(seed, args.lessons, args.liveTenants)));
}
```

`bucketStats` is a Convex query that computes, per bucket, an `α/β` for the
Beta posterior over conversion rate aggregated across experiments. This is
what gets sampled. Within a bucket, the LLM is free to be creative.

If a bucket has zero data, give it a weak prior (`Beta(2, 5)` — mildly
optimistic) so it gets sampled occasionally regardless.

---

## 7. The multi-tenant storefront — implementation detail

### 7.1 Routing

```ts
// apps/storefronts/middleware.ts
import { NextResponse } from "next/server";

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };

export default function middleware(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? "";
  const subdomain = host.split(".")[0];

  // Skip rewrites for the apex
  if (host === process.env.APEX_DOMAIN) return NextResponse.next();

  return NextResponse.rewrite(new URL(`/_sites/${subdomain}${url.pathname}`, req.url));
}
```

### 7.2 Page

```tsx
// apps/storefronts/app/_sites/[domain]/page.tsx
import { ConvexHttpClient } from "convex/browser";

export const dynamicParams = true;
export const revalidate = 60;            // ISR — Convex updates trigger refresh

export default async function Page({ params }: { params: { domain: string } }) {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const tenant = await convex.query("tenants:bySubdomain", { subdomain: params.domain });
  if (!tenant || tenant.status !== "live") notFound();
  return <LandingPage tenant={tenant} />;
}
```

### 7.3 Checkout (per-click Session creation, with attribution)

```ts
// apps/storefronts/app/api/checkout/route.ts
// Called when a customer clicks the CTA on a tenant landing page.
// Creates a Checkout Session with experimentId baked in so the webhook
// can attribute revenue exactly. Replaces the Payment Link approach.
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY!);

export async function POST(req: Request) {
  const { subdomain } = await req.json();
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const tenant = await convex.query("tenants:bySubdomain", { subdomain });
  if (!tenant || tenant.status !== "live") return new Response("not found", { status: 404 });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: tenant.stripePriceId, quantity: 1 }],
    client_reference_id: tenant.experimentId,        // <-- attribution
    metadata: {
      experimentId: tenant.experimentId,
      hypothesisId: tenant.hypothesisId,
      tenantSubdomain: tenant.subdomain,
      generation: String(tenant.generation),
    },
    success_url: `https://${subdomain}.${process.env.APEX_DOMAIN}/thanks?s={CHECKOUT_SESSION_ID}`,
    cancel_url:  `https://${subdomain}.${process.env.APEX_DOMAIN}/`,
  });
  return Response.json({ url: session.url });
}
```

### 7.4 Webhook → Convex (with payment_status guard + async handling)

```ts
// apps/storefronts/app/api/stripe-webhook/route.ts
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";

const stripe = new Stripe(process.env.STRIPE_RESTRICTED_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      // P0 #5 fix: only book revenue when actually paid. Async methods
      // (BNPL, bank debits) can land "completed" while still pending.
      if (s.payment_status === "paid") {
        await convex.mutation("ledger:recordCharge", {
          stripeEventId: event.id,
          amountUsd: (s.amount_total ?? 0) / 100,
          experimentId: s.client_reference_id!,    // exact attribution
          paymentStatus: s.payment_status,
        });
      } else {
        // unpaid / no_payment_required → diagnostic only, no revenue
        await convex.mutation("auditLog:record", {
          stripeEventId: event.id, kind: "session_completed_unpaid",
          experimentId: s.client_reference_id ?? null,
          paymentStatus: s.payment_status,
        });
      }
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      await convex.mutation("ledger:recordCharge", {
        stripeEventId: event.id,
        amountUsd: (s.amount_total ?? 0) / 100,
        experimentId: s.client_reference_id!,
        paymentStatus: "paid",
      });
      break;
    }

    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      await convex.mutation("experiments:markAsyncFailure", {
        experimentId: s.client_reference_id!,
        stripeEventId: event.id,
      });
      break;
    }

    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      await convex.mutation("ledger:recordRefund", {
        stripeEventId: event.id,
        amountUsd: (c.amount_refunded ?? 0) / 100,
        chargeId: c.id,
      });
      break;
    }

    case "charge.dispute.created":
      await convex.mutation("experiments:markDisputed", { stripeEventId: event.id });
      break;
  }
  return new Response("ok");
}
```

The Convex mutations `ledger:recordCharge`, `ledger:recordRefund`, and
`auditLog:record` all require the `stripe-webhook` caller identity (§4.2.1).
Idempotency is handled inside each mutation by checking `stripeEventId`.

---

## 8. Failure model

| # | Failure | Detection | Recovery |
|---|---|---|---|
| 1 | Vercel deploy fails (e.g., domain config) | child catches CLI/API error | retry once with logged details; on second failure, `crash`, skip |
| 2 | Stripe API rate limit (429) | `stripe-agent-toolkit` surfaces 429 | exponential backoff (250ms, 1s, 4s, 16s); after 4 retries, `crash` |
| 3 | Stripe webhook delayed/missing | parent compares Stripe API truth to Convex ledger every 10 min | reconciliation: poll `events.read` for missed events, replay |
| 4 | Convex unavailable | child write fails | child writes to local Tensorlake FS in `/tmp/pending-events.jsonl`, parent reconciles on next loop iteration |
| 5 | Tensorlake parent OOM / crash | Tensorlake's durable execution detects | auto-restart from last snapshot; in-flight children continue; parent re-reads Convex on resume |
| 6 | Tensorlake child times out (>90 min) | Tensorlake enforces timeout | child marked `crash`; tenant set to `paused`; lesson logged |
| 7 | LLM produces invalid hypothesis (Zod fails) | schema validation | re-prompt with Zod errors verbatim, max 3 retries, then `crash` |
| 8 | LLM hallucinates deliverable spec it cannot generate | generator throws | catch in child, mark `crash` with diagnostic; lesson logged |
| 9 | Customer pays but deliverable URL fails | post-purchase delivery worker errors | alert in dashboard; auto-refund via Stripe Agent Toolkit (this is the one place refunds.create scope is required — re-evaluate scope policy) |
| 10 | Cumulative ROAS < 0.2 over 3 generations | watchdog Convex cron (1/hour) | set `budgetState.killSwitchHalt = true`; parent loop polls and pauses |
| 11 | Reacher/Nia/Exa MCP outage | MCP client surfaces error | child uses fallback prior (cached recent results from Convex); lesson notes degraded mode |
| 12 | Fraud / chargeback | Stripe webhook `charge.dispute.created` | freeze affected experiment, mark `discard`, log lesson, alert |

---

## 9. Deployment

### 9.1 Service-by-service

| Service | Command | Notes |
|---|---|---|
| Convex | `pnpm convex deploy --prod` | from repo root, runs out of `convex/` |
| Storefronts (Vercel) | `pnpm vercel --prod --cwd apps/storefronts` | wildcard domain in dashboard once |
| Dashboard (Vercel) | `pnpm vercel --prod --cwd apps/dashboard` | basic-auth or Clerk |
| Parent agent (Tensorlake) | `pnpm tensorlake deploy --cwd apps/parent-agent` | starts the `@application` |

### 9.2 CI

GitHub Actions on every PR:
- `pnpm typecheck` (fails if any package out of sync with shared schemas)
- `pnpm lint`
- `pnpm test` (only on packages that have tests — bandit, deliverables)
- Schema validation: typecheck Convex against `packages/schemas`

Auto-deploy on merge to `main`:
- Convex prod
- Vercel prod (both projects)
- Tensorlake (only if `apps/parent-agent` changed) — manually gated by an
  `agent-deploy` reviewer because deploying mid-loop can lose state

### 9.3 Secrets

One source of truth: **Doppler** project `autodrop`.
- `STRIPE_RESTRICTED_KEY` (rk_live_...)
- `STRIPE_WEBHOOK_SECRET`
- `CONVEX_DEPLOY_KEY` (parent-agent → Convex writes)
- `CONVEX_URL` (public)
- `VERCEL_TOKEN` (scoped to one team, two projects)
- `TENSORLAKE_API_KEY`
- `BROWSERBASE_API_KEY`
- `RESEND_API_KEY`
- `CLOUDFLARE_API_TOKEN` (scoped to one zone)
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (also used for `gpt-image-2`)
- `FAL_API_KEY` (FLUX 2 Pro fallback for image generation)
- `EXA_API_KEY`
- `REACHER_API_KEY`
- `NIA_API_KEY`

Vercel pulls via `vercel env pull`. Convex via `convex env set`.
Tensorlake via its secret store. No secrets ever in source.

### 9.4 Domains

- One owner-controlled apex: `<our-domain>.com` on Cloudflare.
- `*.<our-domain>.com` CNAME → Vercel (one-time DNS edit).
- `<our-domain>.com` for the dashboard.
- Promoted custom domains: agent registers via Cloudflare API and adds via
  Vercel API — no human in the loop for that path, but it consumes from
  a separate `domains_budget` (e.g., 5 domains/day max).

---

## 10. Security boundaries

The agent is autonomous and has access to money rails. Security is
non-negotiable.

### 10.1 Capability limits

| Capability | Mechanism |
|---|---|
| Stripe scope | restricted key (blast-radius limit) + hard-coded action allowlist (§10.2) — RKs alone are NOT sufficient (P1 #6) |
| Refund power | NOT in agent scope. Refund worker is a separate Vercel function with its own restricted key holding `refunds.create`; called only by Convex on `charge.dispute.created` or human-triggered refund mutations. Agent identity has no path to refund. |
| Convex write scope | enforced **inside each Convex function** by caller identity (§4.2.1), NOT by deploy keys. The agent identity cannot mutate `budgetState`, cannot insert `ledgerEvents`, cannot mutate refund-related rows. |
| Budget atomicity | reservation pattern in Convex (§5.7) closes the TOCTOU window — concurrent children cannot collectively exceed caps |
| Vercel scope | one team, two projects, no billing access |
| Cloudflare scope | DNS token (`Zone:DNS:Edit`, one zone) and Registrar token (account-level) are **separate** (P1 #11). DNS token cannot register domains. Registrar token has its own daily domain budget. |
| Browserbase scope | per-session — no persistent identity |
| Email | hard whitelist of recipient lists in Convex; agent cannot ingest free-form addresses; suppression/opt-out/bounce monitoring per Resend compliance (§10.4) |

### 10.2 Stripe action allowlist (the actual enforcement layer)

Stripe restricted keys are resource-level, not action-level. To enforce
"no updates, no refunds, no transfers," we wrap the Agent Toolkit at boot
with a hard-coded allowlist of permitted method names:

```ts
// apps/parent-agent/src/tools/stripe.ts
const ALLOWED_STRIPE_ACTIONS = new Set([
  "products.create",
  "prices.create",
  "checkout.sessions.create",
  "checkout.sessions.retrieve",
  "events.list", "events.retrieve",
] as const);

function wrapStripe(toolkit) {
  return new Proxy(toolkit, {
    get(target, prop) {
      const methodPath = String(prop);
      if (!ALLOWED_STRIPE_ACTIONS.has(methodPath))
        throw new Error(`stripe action not allowed: ${methodPath}`);
      return target[prop];
    },
  });
}
```

This list is fixed at build time, lives in the read-only side of the repo,
and CANNOT be expanded by the agent at runtime. Any attempt to call e.g.
`refunds.create` throws synchronously before reaching Stripe. This is
defense-in-depth on top of the restricted key — even if a prompt-injection
gets the LLM to *try* a refund, the wrapper rejects it.

### 10.2 Prompt-injection containment

LLM input includes scraped pages, customer messages (eventually), and
Reacher/Nia/Exa results. Treat all as untrusted.

- Tool call validation: every Stripe Agent Toolkit call validated against a
  hard-coded action allowlist *outside* the LLM prompt
- No tool can be added to the toolkit at runtime — toolkit shape is fixed
  at parent boot
- Children run in isolated Tensorlake sandboxes; a compromised child cannot
  reach parent state
- Logs of all tool calls written to Convex `auditLog` table (read-only
  to humans); review weekly

### 10.3 Customer-facing surfaces

- Storefront pages do not collect customer data beyond what Stripe Checkout
  handles — no email forms, no PII collection on Vercel
- Deliverable URLs are signed (HMAC), single-use or short-lived
- All pages have a clear `Refund within 7 days, no questions asked` policy
  hard-coded in the footer (not LLM-generated) — chargeback defense

---

## 11. Observability

### 11.1 Required dashboards

1. **Live $ ticker** — Convex realtime sub on `ledgerEvents` (sum). Shown
   on dashboard prominently.
2. **Hypothesis tree** — graph of (parent → children → grandchildren), nodes
   colored by ROAS. Convex query, D3 or React Flow.
3. **Bucket heatmap** — niche × format × channel matrix, cell color = mean
   ROAS, cell size = N experiments. Shows where the agent is converging.
4. **Budget state** — current/per-day spend vs cap, kill-switch state.
5. **Crash log** — `experiments` filtered to `status = "crash"`, with
   notes. Catches systemic problems early.

### 11.2 Tracing

- Tensorlake: built-in trace UI for `@application` and `@function` runs.
- Vercel: Vercel Analytics + a custom log middleware that tags every request
  with the resolved tenant ID.
- Convex: dashboard shows query/mutation latency.
- Sentry: every app sends to Sentry with environment tag.

### 11.3 Audit

- Every Stripe API call from the agent → `auditLog` table with full request/response.
- Every Vercel API call → `auditLog`.
- Every Cloudflare API call → `auditLog`.
- Every Browserbase session start/stop → `auditLog`.

---

## 12. Open questions / known unknowns

> **Resolved in this revision**: P0 race-prone budget checks (§5.7
> reservation pattern), P0 Convex permission model (§4.2.1 caller-identity
> ACLs), P0 Stripe payment_status accounting (§4.4.3 + §7.4 webhook
> handler with `payment_status` guard, async event handling, and
> `client_reference_id` attribution).

These remain unresolved and need senior-engineer verdicts:

1. **Convex vendor lock-in.** Mitigated by Zod schemas, but a real exit costs
   weeks. Acceptable? Alternative: Postgres + Pusher/Ably for realtime.
2. **Tensorlake quota.** Need to confirm how many parallel `@function` runs
   we can sustain on free tier. If <8, the harness's `batchSize` is bottlenecked.
3. **TS bandit lib correctness.** The Beta-quantile implementation needs to
   be tested against a known-good reference (Python `scipy.stats.beta.ppf`).
   Can we write a test that hits a Python sidecar to validate? Or import a
   tested JS lib (`@stdlib/stats-base-dists-beta`)?
4. **Resend deliverability.** A fresh sending domain to a 200-person cold
   list is a coin-flip for inbox vs spam. Need a warmup plan or a pre-warmed
   domain owned by user.
5. **Reacher write sandbox.** The brief says `POST /samples/request` and
   `POST /outreach/draft` are sandboxed and don't dispatch. Confirmed?
   If real dispatch were possible, does that change the threat model?
6. **Custom-domain promotion criteria.** When does an experiment graduate
   from `exp-xxx.<domain>.com` to a real `.com`? Threshold not yet defined.
7. **Refund policy automation.** Failure case 9 needs a separate Stripe key
   with `refunds.create`. Is the cleanest pattern a tiny serverless function
   on Vercel that holds that key, called only from Convex on dispute events,
   never from the agent? (Currently leaning yes.)
8. **Webhook → Convex latency.** End-to-end measurement needed. If the
   ledger lags >10s, the live $ ticker feels broken even though it's correct.
9. **Cold-start traffic floor.** A tenant with 0 visitors stays `pending`
   forever in current design. Need a hard rule: at $20 spend with <30 visitors,
   declare `discard` (the channel itself is broken for this niche).
10. **LLM cost ceiling.** No cap on Anthropic/OpenAI spend currently. Add
    a per-day token budget to `budgetState`.
11. **Deliverable IP.** If the agent generates a "best of HN" curated list
    that includes copyrighted snippets, we have an IP problem. Hard rule:
    no scraped third-party content in deliverables; only synthesized analysis
    of public info.
13. **Image storage.** gpt-image-2 returns URLs that expire ~1 hour (§4.7);
    FLUX outputs persist longer but no SLA. Tenants need permanent URLs.
    Open: use Convex file storage (vendor lock-in cost), Cloudflare R2
    (1 more service, cheaper at scale), or Vercel Blob (close to the apex,
    higher per-GB cost)?
12. **Hackathon framing.** This document assumes production. For demo day,
    `livemode = false` works — does that change the harness's metrics
    interpretation? (Probably not, but worth flagging.)

---

## 13. Out-of-scope for v1 (parking lot)

- ACP / ChatGPT Instant Checkout integration (Surface 2)
- MPP / x402 / agent-to-agent monetization (Surface 3)
- Recurring subscriptions
- Multi-currency
- Multi-region Tensorlake deployment
- A/B testing within a tenant (currently each variant is a fresh tenant)
- LLM-as-judge for deliverable quality (currently no qual gate)
- Customer support automation
- Tax handling beyond Stripe Tax defaults

---

## 14. Quick mental model for review

If you remember nothing else from this doc:

- **One TS monorepo. Tensorlake = body. Vercel = storefronts. Convex = state.**
- **Stripe Payment Links via Agent Toolkit (Surface 1). No ACP/MPP yet.**
- **Read-only files (`revenue.py` analog) are the agent's `prepare.py` —
  the immutable substrate that prevents gaming.**
- **Bayesian classification on noisy revenue data, not greedy keep/discard.**
- **Budget guardrails in code, not prompts.**
- **Multi-tenant via subdomain middleware, one Vercel project, hundreds of tenants.**
- **The agent's identity persists in Tensorlake's durable FS; the world
  state lives in Convex; ground-truth $ flows from Stripe webhooks only.**
