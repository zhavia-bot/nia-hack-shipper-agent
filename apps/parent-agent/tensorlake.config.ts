/**
 * Tensorlake deployment config for the parent-agent app.
 *
 * Topology (per `docs/stack.md` §4.1):
 *   - 1 long-lived `@application` (orchestrator)
 *   - up to 8 parallel `@function` instances (children)
 *
 * The parent owns durable state at /agent/ in Tensorlake's persistent FS.
 * Children get ephemeral sandboxes with explicit secrets injected per
 * purpose (no webhook secret, no refund key, no admin token).
 */
export default {
  name: "autoresearch-money-parent",
  applications: [
    {
      name: "orchestrator",
      entrypoint: "src/orchestrator.ts",
      memoryMb: 1024,
      durableState: "/agent",
    },
  ],
  functions: [
    {
      name: "run-hypothesis",
      entrypoint: "src/child.ts",
      memoryMb: 2048,
      timeout: "90m",
      maxConcurrency: 8,
    },
  ],
  secrets: [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "FAL_API_KEY",
    "STRIPE_RESTRICTED_KEY",
    "CONVEX_URL",
    "CONVEX_AGENT_TOKEN",
    "AUTH_JWT_SECRET",
    "VERCEL_TOKEN",
    "VERCEL_STOREFRONTS_PROJECT_ID",
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "RESEND_API_KEY",
    "CLOUDFLARE_DNS_TOKEN",
    "CLOUDFLARE_REGISTRAR_TOKEN",
    "CLOUDFLARE_ZONE_ID",
    "EXA_API_KEY",
    "REACHER_API_KEY",
    "NIA_API_KEY",
    "APEX_DOMAIN",
  ],
};
