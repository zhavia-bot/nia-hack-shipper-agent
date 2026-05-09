/**
 * Load the symmetric HMAC secret from env. We use HS256 because all five
 * identity holders are services we operate (agent / stripe-webhook /
 * refund-worker / dashboard / admin) — there is no third-party verifier
 * that needs a public key. RS256 + JWKS is the path if we ever need to
 * accept tokens minted outside our trust boundary.
 */
const ENV_KEY = "AUTH_JWT_SECRET";

export function loadAuthSecret(env: NodeJS.ProcessEnv = process.env): Uint8Array {
  const raw = env[ENV_KEY];
  if (!raw || raw === "REPLACE_ME_with_32_byte_random") {
    throw new Error(
      `${ENV_KEY} is not set or still at placeholder. Generate via: openssl rand -base64 32`
    );
  }
  if (raw.length < 32) {
    throw new Error(
      `${ENV_KEY} must be ≥32 bytes for HS256 strength; got ${raw.length}`
    );
  }
  return new TextEncoder().encode(raw);
}
