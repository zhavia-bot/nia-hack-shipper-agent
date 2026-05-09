# Implementation Readiness — gaps to close before coding starts

> Written as a handoff. The stack design in `docs/stack.md` is ~80% ready
> for an agent to implement. This file lists the specific gaps where a
> coding agent would stall within the first hour. Resolve these in order,
> then implementation can proceed.

## The 5 things to resolve before handing off

### 1. The `program.md` skill itself doesn't exist
This is the most important miss. `docs/stack.md` references
`apps/parent-agent/src/program.md` as "the skill" but the actual content
isn't written. That's the file the agent reads on every loop iteration to
know what it can/cannot do, what the metric is, the keep/discard rule, the
NEVER-STOP injection. Without it, a coding agent will either skip it
(silent failure mode) or fabricate one.

**Action**: Write `docs/harness.md` with the verbatim `program.md` content
before any code lands. Mirror Karpathy's structure (Setup / Experimentation
/ Output format / Logging / Loop / NEVER STOP) but adapted for the
money-making metric (ROAS_hat, Bayesian classification, 70/20/10 explore
allocation, hard budget reservation as step 1 of every child). All the
ingredients for this are already specified across §5.7, §6, §10 of
`stack.md`.

### 2. Tensorlake TypeScript runtime is unverified
The reviewer flagged this as P0. `docs/stack.md` still assumes
`@application`/`@function` decorators in TS, but Tensorlake's TS SDK is
documented for sandboxes/cloud APIs, not clearly for the application
decorator runtime. A coding agent starts the parent-agent app, hits a
missing decorator, stalls.

**Action**: Either (a) 5-minute confirmation message to Tensorlake to
verify TS decorator support is production-ready, OR (b) commit to **Python
for `apps/parent-agent`** (the rest of the monorepo stays TypeScript).
Update §2 of `stack.md` accordingly.

### 3. Runtime versions are inconsistent
`docs/stack.md` §2 says Node 22; the reviewer recommended Node 24 +
TS 6.0 + Next.js 16. The doc references both in different places. A
coding agent needs a single source of truth in `package.json` immediately.

**Action**: Pick once, write once at the top of §2, delete contradictions.
Specifically pin: Node version, TypeScript version, Next.js version,
pnpm version, Convex client version, Stripe SDK version, OpenAI SDK
version, fal.ai client version.

### 4. Convex identity provider is undecided
§4.2.1 says "Clerk or a small custom JWT issuer." That's a fork in the
road that ripples through every Convex function (each one starts with
`requireIdentity(ctx, [...])`).

- **Clerk**: pulls in another dependency + Clerk account + ~$25/mo
- **Custom JWT**: ~50 lines of code we own

**Recommendation**: Custom JWT for v1. The 5 service identities
(`agent` / `stripe-webhook` / `refund-worker` / `dashboard` / `admin`)
are not human users — Clerk's UI features are wasted on them. Write a
small `packages/auth` module that issues + verifies JWTs with role claims,
and a `requireIdentity(ctx, allowedRoles)` helper used inside every
Convex function. Decide and update §4.2.1.

### 5. Image storage destination is undecided
`docs/stack.md` §12 question 13 is still open. `gpt-image-2` returns URLs
that expire in ~1 hour, so the storage question blocks the asset-gen
pipeline that §4.7 depends on.

Options:
- **Convex File Storage** — simplest, vendor lock-in, file pointers live
  next to tenant rows
- **Cloudflare R2** — cheapest at scale, +1 service to manage
- **Vercel Blob** — closest to the apex/storefronts, costlier per GB

**Recommendation**: Convex File Storage for v1. One less moving part, we
already accept Convex lock-in elsewhere. Migrate to R2 only if costs
become a problem. Decide and update §4.7.

---

## Smaller things a coding agent can resolve in flight

These don't block scaffolding; they can be filled in as implementation
proceeds:

- **Apex domain choice** — agent can ask once or use a placeholder
  (`<apex>` is referenced throughout `stack.md`)
- **Specific Reacher tools to call** (out of 33) — discoverable at
  runtime by exploring the MCP tool list; pick during the propose() impl
- **Nia corpus content** — can be indexed in a separate setup task; the
  curation list can be a separate `docs/nia-corpus.md` later
- **The Bayesian bandit lib** — `@stdlib/stats-base-dists-beta` is fine,
  or 30 lines of inline code; the coding agent can pick

---

## What to do, in order

1. **Write `docs/harness.md`** with the `program.md` content — this is the
   agent's brain and the most load-bearing missing artifact.
2. **Resolve runtime versions** in `docs/stack.md` §2 (5-min fix).
3. **Resolve Tensorlake TS vs Python** — one external confirmation, or
   commit to Python for the parent-agent app.
4. **Resolve identity provider** — recommend custom JWT, update §4.2.1.
5. **Resolve image storage** — recommend Convex File Storage, update §4.7.
6. **Scaffold the monorepo skeleton** — root `package.json`,
   `pnpm-workspace.yaml`, `turbo.json`, `tsconfig` base — so the coding
   agent doesn't burn context bootstrapping.

After those six, `docs/stack.md` is implementation-ready. Without
`docs/harness.md` (the `program.md` content) specifically, the coding
agent is missing the most load-bearing artifact in the whole system.
