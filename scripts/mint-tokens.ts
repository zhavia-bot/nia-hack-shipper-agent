/**
 * One-shot helper: mint per-identity JWTs from AUTH_JWT_SECRET and
 * print them in env-var format. Pipe to .env.local.
 *
 *   AUTH_JWT_SECRET=… pnpm tsx scripts/mint-tokens.ts >> .env.local
 *
 * Self-contained (uses `jose` directly) so it works without workspace
 * graph resolution. Issuer + alg + per-role TTLs mirror packages/auth.
 */
import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";

const ISSUER = "autoresearch-money";
const ALG = "HS256";

const TTL_SECONDS_BY_ROLE = {
  agent: 60 * 60,
  "stripe-webhook": 24 * 60 * 60,
  "refund-worker": 24 * 60 * 60,
  dashboard: 7 * 24 * 60 * 60,
  admin: 30 * 24 * 60 * 60,
  "budget-watchdog": 24 * 60 * 60,
} as const;

type Role = keyof typeof TTL_SECONDS_BY_ROLE;

const secretRaw = process.env["AUTH_JWT_SECRET"];
if (!secretRaw || secretRaw.length < 32) {
  console.error("AUTH_JWT_SECRET must be set and ≥32 bytes.");
  process.exit(1);
}
const secret = new TextEncoder().encode(secretRaw);

async function mint(role: Role, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS_BY_ROLE[role])
    .sign(secret);
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
  "# === minted by scripts/mint-tokens.ts ===",
  `AUTH_JWT_SECRET=${secretRaw}`,
];

for (const r of roles) {
  lines.push(`${r.env}=${await mint(r.role, r.subject)}`);
}

lines.push(`DELIVER_TOKEN_SECRET=${randomBytes(32).toString("hex")}`);
lines.push(`DASHBOARD_BASIC_AUTH=admin:${randomBytes(12).toString("base64url")}`);
lines.push("# === end minted ===");

console.log(lines.join("\n"));
