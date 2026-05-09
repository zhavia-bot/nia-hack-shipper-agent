/**
 * Load RS256 keys from env. Both keys are stored base64-encoded PEM:
 *
 *   AUTH_JWT_PRIVATE_KEY  — signers (mint-tokens.ts only; never sent to Convex)
 *   AUTH_JWT_PUBLIC_KEY   — verifiers (Convex env, plus any service that
 *                           wants to validate a token locally)
 *
 * RS256 (vs HS256 originally) so service JWTs can validate through
 * Convex's auth.config.ts alongside Clerk human sessions, which only
 * accepts asymmetric algorithms.
 */
import { importPKCS8, importSPKI, type KeyLike } from "jose";

const ALG = "RS256";

export async function loadPrivateKey(env: NodeJS.ProcessEnv = process.env): Promise<KeyLike> {
  const raw = env["AUTH_JWT_PRIVATE_KEY"];
  if (!raw) {
    throw new Error(
      "AUTH_JWT_PRIVATE_KEY is not set. Generate via: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out priv.pem && base64 -i priv.pem"
    );
  }
  const pem = Buffer.from(raw, "base64").toString("utf8");
  return importPKCS8(pem, ALG);
}

export async function loadPublicKey(env: NodeJS.ProcessEnv = process.env): Promise<KeyLike> {
  const raw = env["AUTH_JWT_PUBLIC_KEY"];
  if (!raw) {
    throw new Error("AUTH_JWT_PUBLIC_KEY is not set.");
  }
  const pem = Buffer.from(raw, "base64").toString("utf8");
  return importSPKI(pem, ALG);
}
