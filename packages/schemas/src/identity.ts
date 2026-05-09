import { z } from "zod";

/**
 * Five service identities. Caller-identity ACLs are enforced INSIDE each
 * Convex mutation via `requireIdentity(ctx, [allowedRoles])`. Convex deploy
 * keys deploy code; they do not enforce row-level ACLs.
 */
export const IdentityRoleSchema = z.enum([
  "agent",
  "stripe-webhook",
  "refund-worker",
  "dashboard",
  "admin",
  // Budget kill-switch only: can set killSwitchHalt = true, cannot raise
  // caps, cannot mutate any other table. See `convex/budget.ts`.
  "budget-watchdog",
]);
export type IdentityRole = z.infer<typeof IdentityRoleSchema>;

export const IdentityClaimsSchema = z.object({
  role: IdentityRoleSchema,
  iat: z.number().int(),
  exp: z.number().int(),
  iss: z.string(),
  sub: z.string(),
});
export type IdentityClaims = z.infer<typeof IdentityClaimsSchema>;
