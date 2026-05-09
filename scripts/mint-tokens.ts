/**
 * One-shot helper: mint per-identity JWTs from AUTH_JWT_PRIVATE_KEY and
 * print them in env-var format. Pipe to .env.local.
 *
 *   AUTH_JWT_PRIVATE_KEY=<base64 PEM> pnpm tsx scripts/mint-tokens.ts >> .env.local
 *
 * Self-contained (uses `jose` directly). RS256 — keep parity with
 * convex/_lib/identity.ts. Issuer + per-role TTLs mirror packages/auth.
 */
import { SignJWT, importPKCS8 } from "jose";

const ISSUER = "autodrop";
const ALG = "RS256";

const TTL_SECONDS_BY_ROLE = {
  agent: 60 * 60,
  "stripe-webhook": 24 * 60 * 60,
  "refund-worker": 24 * 60 * 60,
  dashboard: 7 * 24 * 60 * 60,
  admin: 30 * 24 * 60 * 60,
  "budget-watchdog": 24 * 60 * 60,
} as const;

type Role = keyof typeof TTL_SECONDS_BY_ROLE;

const privRaw = process.env["AUTH_JWT_PRIVATE_KEY"];
if (!privRaw) {
  console.error(
    "AUTH_JWT_PRIVATE_KEY must be set (base64-encoded PEM PKCS8)."
  );
  process.exit(1);
}
const privPem = Buffer.from(privRaw, "base64").toString("utf8");
const privateKey = await importPKCS8(privPem, ALG);

async function mint(role: Role, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS_BY_ROLE[role])
    .sign(privateKey);
}

const roles: { env: string; role: Role; subject: string }[] = [
  { env: "CONVEX_AGENT_TOKEN", role: "agent", subject: "agent-dev" },
  { env: "CONVEX_STRIPE_WEBHOOK_TOKEN", role: "stripe-webhook", subject: "storefronts-webhook" },
  { env: "CONVEX_REFUND_WORKER_TOKEN", role: "refund-worker", subject: "refund-worker" },
  { env: "CONVEX_DASHBOARD_TOKEN", role: "dashboard", subject: "dashboard" },
  { env: "NEXT_PUBLIC_CONVEX_DASHBOARD_TOKEN", role: "dashboard", subject: "dashboard-browser" },
  { env: "CONVEX_ADMIN_TOKEN", role: "admin", subject: "admin" },
  { env: "CONVEX_STOREFRONT_TOKEN", role: "stripe-webhook", subject: "storefronts-server" },
];

const lines: string[] = [
  "",
  "# === minted by scripts/mint-tokens.ts (RS256) ===",
];

for (const r of roles) {
  lines.push(`${r.env}=${await mint(r.role, r.subject)}`);
}

lines.push("# === end minted ===");

console.log(lines.join("\n"));
