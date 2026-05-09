import { z } from "zod";
import { loadEnv } from "@autoresearch/shared";

// P7.2 — platform stops paying for anything the agent burns. The platform
// only owns: Stripe of-record, Convex (canonical state), Vercel (hosting +
// workflows), apex domain. Everything the agent uses to do work — LLM
// inference, search, browser, email, image gen, DNS — is BYOK and flows
// per-run via run-context.ts from the user row.
const ParentAgentEnvSchema = z.object({
  // Stripe — agent's restricted key for the platform side. forConnectedAccount
  // adds the Stripe-Account header so charges land in the user's balance.
  STRIPE_RESTRICTED_KEY: z.string().min(1),

  // Convex — public URL + agent-scoped service token (RS256, role=agent).
  CONVEX_URL: z.string().url(),
  CONVEX_AGENT_TOKEN: z.string().min(1),

  // Vercel — platform-level for tenant deploys
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_STOREFRONTS_PROJECT_ID: z.string().min(1),

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
