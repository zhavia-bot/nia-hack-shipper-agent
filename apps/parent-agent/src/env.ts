import { z } from "zod";
import { loadEnv } from "@autoresearch/shared";

const ParentAgentEnvSchema = z.object({
  // LLMs
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  FAL_API_KEY: z.string().min(1),

  // Stripe — agent's restricted key only. Webhook secret and refund key
  // do NOT reach the agent sandbox by design.
  STRIPE_RESTRICTED_KEY: z.string().min(1),

  // Convex — public URL + agent-scoped token (NOT deploy key, NOT admin).
  CONVEX_URL: z.string().url(),
  CONVEX_AGENT_TOKEN: z.string().min(1),

  // Auth — used to verify tokens we mint for sub-calls if any. The agent
  // sandbox does NOT mint tokens for itself; the orchestrator does at boot.
  AUTH_JWT_SECRET: z.string().min(32),

  // External hands
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_STOREFRONTS_PROJECT_ID: z.string().min(1),
  BROWSERBASE_API_KEY: z.string().min(1),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().min(1),
  CLOUDFLARE_DNS_TOKEN: z.string().min(1),
  CLOUDFLARE_REGISTRAR_TOKEN: z.string().min(1),
  CLOUDFLARE_ZONE_ID: z.string().min(1),

  // Sense organs
  EXA_API_KEY: z.string().min(1),
  REACHER_API_KEY: z.string().min(1),
  NIA_API_KEY: z.string().min(1),

  // Apex / display
  APEX_DOMAIN: z.string().min(1),

  // Optional
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ParentAgentEnv = z.infer<typeof ParentAgentEnvSchema>;

let cached: ParentAgentEnv | null = null;
export function env(): ParentAgentEnv {
  if (!cached) cached = loadEnv(ParentAgentEnvSchema);
  return cached;
}
