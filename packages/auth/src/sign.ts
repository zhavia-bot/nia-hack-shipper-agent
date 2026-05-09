import { SignJWT, jwtVerify, type KeyLike } from "jose";
import {
  IdentityClaimsSchema,
  type IdentityClaims,
  type IdentityRole,
} from "@autoresearch/schemas";
import { IdentityError } from "@autoresearch/shared";
import { defaultTtl } from "./ttl.js";

export const ISSUER = "autoresearch-money";
const ALG = "RS256";

export interface MintArgs {
  role: IdentityRole;
  /** Stable identifier for the holder, e.g. "agent-prod" or "stripe-webhook". */
  subject: string;
  /** Override the per-role default TTL. */
  ttlSeconds?: number;
  /** RS256 private key — get from `loadPrivateKey()` at boot. */
  privateKey: KeyLike;
}

export async function mintToken(args: MintArgs): Promise<string> {
  const ttl = args.ttlSeconds ?? defaultTtl(args.role);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: args.role })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(args.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(args.privateKey);
}

/**
 * Verify a JWT and parse its claims. Throws `IdentityError` on any
 * tamper / expiry / issuer mismatch / schema violation. Caller is
 * responsible for the role check (use `requireIdentity` for that).
 */
export async function verifyToken(
  token: string,
  publicKey: KeyLike
): Promise<IdentityClaims> {
  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: ISSUER,
      algorithms: [ALG],
    });
    const parsed = IdentityClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new IdentityError(
        `claim shape invalid: ${parsed.error.issues
          .map((i) => i.path.join(".") + ":" + i.message)
          .join(", ")}`
      );
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof IdentityError) throw err;
    throw new IdentityError(
      `token verification failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
