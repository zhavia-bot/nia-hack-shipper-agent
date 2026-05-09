# Stack & Architecture

> Status: design draft for senior-engineer review. Critique freely.
>
> This document defines the runtime topology, language choices, data ownership,
> failure model, and deployment story for an autonomous agent whose terminal
> goal is `maximize $ in Stripe balance`. It assumes the harness pattern
> defined in `docs/harness.md` (Karpathy-derived autoresearch loop) and does
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

**Source of truth for**: tenants, experiments, ledger events, lessons, budget singleton.

**Why Convex over Postgres + Redis + websockets:**
- Realtime subs are first-class — the dashboard becomes a 30-line component.
- Server functions are TS, share types with the rest of the monorepo.
- Webhook → DB → subscribers fan-out is one server function, no Pub/Sub.
- Free tier handles our scale (hundreds of writes/min peak).

**Trade-off**: vendor lock-in. Mitigated by keeping schemas in
`packages/schemas` (Zod) — Convex tables are projections of those.

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

**Surface 1 only** for v1: classic Payment Links via Agent Toolkit. ACP and MPP
are out of scope for now (see `docs/runbook.md` for upgrade path).

**Restricted key scope** (`rk_test_*` then `rk_live_*`):
- `paymentLinks.create`
- `products.create`
- `prices.create`
- `checkout.read`
- `events.read` (for poll-based reconciliation if webhook is delayed)
- Nothing else. Specifically NOT: `paymentLinks.update`, `products.update`,
  refunds, transfers, customers.write.

**Webhook setup**:
- Endpoint: `https://storefronts.<domain>/api/stripe-webhook`
- Events: `checkout.session.completed`, `charge.refunded`, `payment_intent.succeeded`
- Signing secret in Vercel env, NOT in agent sandbox (the agent never sees
  the raw webhook stream — it only reads digested ledger events from Convex).

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
  stripePaymentLinkId: v.string(),
  stripeProductId: v.string(),
  deliverableKind: v.string(),
  deliverableSpec: v.any(),                // for re-generation on demand
  customDomain: v.optional(v.string()),
  status: v.union(v.literal("live"), v.literal("paused"), v.literal("killed")),
  createdAt: v.number(),
}).index("by_subdomain", ["subdomain"])
  .index("by_hypothesis", ["hypothesisId"])
  .index("by_status", ["status"]);
```

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
  source: v.string(),                      // "stripe_webhook" | "google_ads_api" | "manual"
  timestamp: v.number(),
}).index("by_stripe_event", ["stripeEventId"])
  .index("by_experiment", ["experimentId"])
  .index("by_timestamp", ["timestamp"]);
```

Idempotency: Stripe webhook handler checks `by_stripe_event` before insert.
Stripe replays are common.

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

### 5.6 BudgetState (Convex `budgetState` — immutable singleton)

```ts
defineTable({
  perExperimentUsd: v.number(),            // 20
  perGenerationUsd: v.number(),            // 100
  perDayUsd: v.number(),                   // 500
  killSwitchHalt: v.boolean(),
  killSwitchReason: v.optional(v.string()),
});
```

Only updated by:
1. A human-authored migration in `convex/budget.ts`
2. The watchdog function (only to set `killSwitchHalt = true` — never to
   raise limits). Watchdog logic lives in code reviewed by humans.

The agent CANNOT update `budgetState`. The agent's restricted key for Convex
(if we add one — see §10) does not include write to this table.

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

@application({ name: "autoresearch-money-parent" })
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

    // Validate and budget-check before spending anything
    for (const h of hypotheses) {
      HypothesisSchema.parse(h);
      await checkBudget(h.trafficPlan.budgetUsd);
    }

    // Fan-out children. Each one is its own Tensorlake sandbox.
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
import { Hypothesis } from "@autoresearch/schemas";
import { stripe } from "./tools/stripe.js";
import { vercel } from "./tools/vercel.js";
import { generateDeliverable } from "./tools/deliverables/index.js";
import { driveTraffic } from "./tools/traffic/index.js";
import { convex } from "./tools/convex-client.js";

@fn({ name: "run-hypothesis", timeout: "90m", memoryMb: 2048 })
export async function runChild(h: Hypothesis): Promise<ExperimentResult> {
  const expId = await convex.mutation("experiments:create", { hypothesis: h });

  try {
    // 1. Generate deliverable artifact
    const deliverableUrl = await generateDeliverable(h.deliverable);

    // 2. Create Stripe product + payment link
    const { productId, paymentLinkId, paymentLinkUrl } = await stripe.createOffer({
      name: h.copy.headline, price: h.price * 100, currency: "usd",
    });

    // 3. Create tenant row → goes live instantly via multi-tenant middleware
    const subdomain = `exp-${h.id.slice(0, 8)}`;
    await convex.mutation("tenants:create", {
      subdomain, hypothesisId: h.id, stripePaymentLinkId: paymentLinkId,
      stripeProductId: productId, deliverableKind: h.deliverable.kind,
      deliverableSpec: h.deliverable.spec,
    });

    // 4. Drive traffic (channel-specific implementation, all bounded by budget)
    await driveTraffic({
      channel: h.bucket.channel, tenantUrl: `https://${subdomain}.<domain>.com`,
      copy: h.copy, budgetUsd: h.trafficPlan.budgetUsd,
    });

    // 5. Wait for measurement window (60 min default)
    await sleep(60 * 60 * 1000);

    // 6. Collect metrics from Convex (revenue + visitors + spend)
    const metrics = await convex.query("experiments:metrics", { id: expId });

    // 7. Tell parent — actual classification happens in selectAndClassify
    return { expId, metrics, status: "pending" };
  } catch (err) {
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

### 7.3 Webhook → Convex

```ts
// apps/storefronts/app/api/stripe-webhook/route.ts
import { ConvexHttpClient } from "convex/browser";
import Stripe from "stripe";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const convex = new ConvexHttpClient(process.env.CONVEX_URL!);
    await convex.mutation("ledger:recordCharge", {
      stripeEventId: event.id,
      amountUsd: (session.amount_total ?? 0) / 100,
      paymentLinkId: session.payment_link as string,
    });
  }
  return new Response("ok");
}
```

The Convex mutation `ledger:recordCharge` looks up the `tenant` and
`experiment` by `paymentLinkId`, idempotently inserts a `LedgerEvent`,
and updates the `experiment.revenueUsd` aggregate.

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

One source of truth: **Doppler** project `autoresearch-money`.
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
- `OPENAI_API_KEY`
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
| Stripe scope | restricted key with explicit allowed actions, see §4.4 |
| Refund power | NOT in agent scope. Auto-refunds in failure case 9 use a separate human-approved key held only by the post-purchase delivery worker |
| Convex write scope | dedicated deploy key; cannot write to `budgetState` or `ledgerEvents.amount > 0` (only the webhook handler can record charges) |
| Vercel scope | one team, two projects, no billing access |
| Cloudflare scope | one zone, no account-level access |
| Browserbase scope | per-session — no persistent identity |
| Email | hard whitelist of recipient lists in Convex; agent cannot ingest free-form addresses |

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

These need senior-engineer verdicts:

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
