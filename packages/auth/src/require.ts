import type { IdentityClaims, IdentityRole } from "@autoresearch/schemas";
import { IdentityError } from "@autoresearch/shared";
import type { KeyLike } from "jose";
import { verifyToken } from "./sign.js";

/**
 * Convex-side guard. Call as the first line of every mutation that has
 * caller-identity ACLs (which is every mutation except read-only queries
 * served via the `dashboard` token).
 *
 * Convex does not expose request-scoped auth headers for HS256 tokens; we
 * pass the token as an explicit `token` arg in the mutation's args object.
 * This is the documented pattern from `docs/stack.md` §4.2.1.
 *
 * @throws IdentityError on missing/invalid/expired token, or wrong role.
 */
export async function requireIdentity(
  token: string | null | undefined,
  allowedRoles: readonly IdentityRole[],
  publicKey: KeyLike
): Promise<IdentityClaims> {
  if (!token) {
    throw new IdentityError("missing identity token");
  }
  const claims = await verifyToken(token, publicKey);
  if (!allowedRoles.includes(claims.role)) {
    throw new IdentityError(
      `role ${claims.role} not permitted (need one of: ${allowedRoles.join(", ")})`
    );
  }
  return claims;
}

/** Convenience: accept any of the listed roles, return the matched role. */
export async function requireAnyIdentity(
  token: string | null | undefined,
  allowedRoles: readonly IdentityRole[],
  publicKey: KeyLike
): Promise<IdentityRole> {
  const claims = await requireIdentity(token, allowedRoles, publicKey);
  return claims.role;
}
