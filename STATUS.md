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
8. Step 7 — `packages/auth` (jose HS256, mintToken, verifyToken, requireIdentity)

## In progress
- Step 8: convex/

## Next
9. apps/parent-agent (+ program.md)
10. apps/storefronts
11. apps/dashboard

## Notes
- Stack pins: Node 24, TS 6.0, Next.js 16, pnpm 11, ESM only
- Hard invariants in AGENTS.md must hold
- pnpm install NOT yet run; run after step 11
- Token passed in mutation args (`token: v.string()`) since Convex doesn't natively verify HS256
