/**
 * Vendored identity verification for Convex mutations. Equivalent to
 * `@autoresearch/auth` but local to the convex/ deploy bundle to avoid
 * any concern about workspace-package resolution inside the Convex runtime.
 *
 * Token shape: HS256 JWT, issuer "autoresearch-money", payload includes
 * `role` ∈ {agent, stripe-webhook, refund-worker, dashboard, admin,
 * budget-watchdog}. Secret comes from the AUTH_JWT_SECRET Convex env var
 * (set via `npx convex env set AUTH_JWT_SECRET <32+ bytes>`).
 *
 * IMMUTABLE — every mutation that mutates state imports `requireIdentity`
 * from this file as the first line of its handler. Do not edit without
 * a CODEOWNERS-tagged review.
 */
import { jwtVerify } from "jose";

const ISSUER = "autoresearch-money";
const ALG = "HS256";

export type IdentityRole =
  | "agent"
  | "stripe-webhook"
  | "refund-worker"
  | "dashboard"
  | "admin"
  | "budget-watchdog";

export interface IdentityClaims {
  role: IdentityRole;
  iat: number;
  exp: number;
  iss: string;
  sub: string;
}

const ALLOWED_ROLES: ReadonlySet<IdentityRole> = new Set([
  "agent",
  "stripe-webhook",
  "refund-worker",
  "dashboard",
  "admin",
  "budget-watchdog",
]);

let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env["AUTH_JWT_SECRET"];
  if (!raw) {
    throw new Error("AUTH_JWT_SECRET is not set in Convex env");
  }
  if (raw.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be ≥32 bytes for HS256 strength");
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export class IdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

export async function requireIdentity(
  token: string | null | undefined,
  allowedRoles: readonly IdentityRole[]
): Promise<IdentityClaims> {
  if (!token) throw new IdentityError("missing identity token");
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      algorithms: [ALG],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err) {
    throw new IdentityError(
      `token verification failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const role = payload["role"];
  if (typeof role !== "string" || !ALLOWED_ROLES.has(role as IdentityRole)) {
    throw new IdentityError(`invalid role claim: ${String(role)}`);
  }
  if (!allowedRoles.includes(role as IdentityRole)) {
    throw new IdentityError(
      `role ${role} not permitted (need one of: ${allowedRoles.join(", ")})`
    );
  }
  return {
    role: role as IdentityRole,
    iat: Number(payload["iat"]),
    exp: Number(payload["exp"]),
    iss: String(payload["iss"]),
    sub: String(payload["sub"]),
  };
}
