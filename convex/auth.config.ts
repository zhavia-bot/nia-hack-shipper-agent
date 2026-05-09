/**
 * No external auth provider. Identity verification happens INSIDE each
 * mutation via `_lib/identity.ts` using HS256 JWTs minted by the agent's
 * boot process. See AGENTS.md invariant #5 and `docs/stack.md` §4.2.1.
 *
 * If we ever add a third-party verifier (e.g. dashboard auth via Clerk),
 * register the OIDC provider here.
 */
export default {
  providers: [],
};
