# STATUS

Resume point if context compacts. Read this + `AGENTS.md` to pick up.

## Done
1. AGENTS.md + CLAUDE.md symlink + STATUS.md
2. Step 1 — Monorepo scaffold
3. Step 2 — `packages/schemas`
4. Step 3 — `packages/shared`
5. Step 4 — `packages/bandit`
6. Step 5 — `packages/deliverables`
7. Step 6 — `packages/prompts`
8. Step 7 — `packages/auth`
9. Step 8 — `convex/` (schema, tenants, experiments, ledger [IMMUTABLE], lessons, budget [IMMUTABLE], auditLog, system, http; vendored identity check)
10. Step 9 — `apps/parent-agent` (orchestrator, child, propose/select/lessons, all tools, program.md)
11. Step 10 — `apps/storefronts` (multi-tenant Next 16, middleware rewrite, /api/checkout, /api/stripe-webhook, /api/deliver/[token], success page, HMAC deliver-token, convex/storage.ts)

## In progress
- Step 11: apps/dashboard (live $ ticker via Convex realtime)

## Next
- (last step)

## Notes
- Stack pins: Node 24, TS 6.0, Next.js 16, pnpm 11, ESM only
- Hard invariants in AGENTS.md must hold
- Identity vendored into `convex/_lib/identity.ts` to avoid workspace-resolution risk
- Added `budget-watchdog` 6th identity (kill-switch only)
- pnpm install NOT yet run; run after step 11
- `convex/_generated/` populated by `pnpm --filter @autoresearch/convex codegen`
