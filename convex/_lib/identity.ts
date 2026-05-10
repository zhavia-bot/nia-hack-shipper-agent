/**
 * Vendored identity verification for Convex mutations. Equivalent to
 * `@autodrop/auth` but local to the convex/ deploy bundle to avoid
 * any concern about workspace-package resolution inside the Convex runtime.
 *
 * Token shape: RS256 JWT, issuer "autodrop", payload includes
 * `role` ∈ {agent, stripe-webhook, refund-worker, dashboard, admin,
 * budget-watchdog}. Public key comes from the AUTH_JWT_PUBLIC_KEY Convex
 * env var (base64-encoded PEM, set via `npx convex env set
 * AUTH_JWT_PUBLIC_KEY <base64 PEM>`).
 *
 * Why RS256 instead of HS256: Convex's first-party auth.config.ts JWT
 * verification only accepts asymmetric algorithms. Sticking with HS256
 * would mean the agent/webhooks live outside Convex's auth surface and
 * we'd have to maintain a parallel auth path. RS256 lets service JWTs
 * coexist with Clerk human sessions in a single auth.config.ts.
 *
 * IMMUTABLE — every mutation that mutates state imports `requireIdentity`
 * from this file as the first line of its handler. Do not edit without
 * a CODEOWNERS-tagged review.
 */
import { jwtVerify, importSPKI, type KeyLike } from "jose";

const ISSUER = "autodrop";
const ALG = "RS256";

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

let cachedKey: KeyLike | null = null;
async function getPublicKey(): Promise<KeyLike> {
  if (cachedKey) return cachedKey;
  const raw = process.env["AUTH_JWT_PUBLIC_KEY"];
  if (!raw) {
    throw new Error("AUTH_JWT_PUBLIC_KEY is not set in Convex env");
  }
  const pem = atob(raw.replace(/\s+/g, ""));
  cachedKey = await importSPKI(pem, ALG);
  return cachedKey;
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
    const verified = await jwtVerify(token, await getPublicKey(), {
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
