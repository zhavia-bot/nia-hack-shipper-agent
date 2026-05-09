# STATUS

Resume point if context compacts. Read this + `AGENTS.md` to pick up.

## Done
1. AGENTS.md + CLAUDE.md symlink + STATUS.md
2. Step 1 — Monorepo scaffold
3. Step 2 — `packages/schemas` (Hypothesis, Tenant, Experiment, LedgerEvent, Lesson, BudgetState, BudgetReservation, Identity)

## In progress
- Step 3: packages/shared

## Next
4. packages/bandit
5. packages/deliverables
6. packages/prompts
7. packages/auth
8. convex/
9. apps/parent-agent (+ program.md)
10. apps/storefronts
11. apps/dashboard

## Notes
- Stack pins: Node 24, TS 6.0, Next.js 16, pnpm 11, ESM only
- Hard invariants in AGENTS.md must hold
- pnpm install NOT yet run; run after step 11
- Schemas exported from `@autoresearch/schemas`; consumed by all packages/apps
