import { z } from "zod";
import { loadEnv } from "@autoresearch/shared";

// Platform-level secrets stay required at process startup. BYOK keys
// (OpenAI, Browserbase, Resend, Reacher, Nia, FAL, Cloudflare) flow per-run
// via AsyncLocalStorage from the user row — see ./run-context.ts. Env values
// for those are dev-only fallbacks; we keep them optional here.
const ParentAgentEnvSchema = z.object({
  // Platform LLMs / sense organs (kept platform-level per STATUS P3.2)
  ANTHROPIC_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),

  // Stripe — agent's restricted key only. Webhook secret and refund key
  // do NOT reach the agent sandbox by design.
  STRIPE_RESTRICTED_KEY: z.string().min(1),

  // Convex — public URL + agent-scoped token (NOT deploy key, NOT admin).
  CONVEX_URL: z.string().url(),
  CONVEX_AGENT_TOKEN: z.string().min(1),

  // Vercel — platform-level for tenant deploys
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_STOREFRONTS_PROJECT_ID: z.string().min(1),

  // Apex / display
  APEX_DOMAIN: z.string().min(1),

  // BYOK fallbacks (optional — real values come from user row via run-context)
  OPENAI_API_KEY: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  BROWSERBASE_API_KEY: z.string().optional(),
  BROWSERBASE_PROJECT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  REACHER_API_KEY: z.string().optional(),
  NIA_API_KEY: z.string().optional(),
  CLOUDFLARE_DNS_TOKEN: z.string().optional(),
  CLOUDFLARE_REGISTRAR_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // Optional
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ParentAgentEnv = z.infer<typeof ParentAgentEnvSchema>;

let cached: ParentAgentEnv | null = null;
export function env(): ParentAgentEnv {
  if (!cached) cached = loadEnv(ParentAgentEnvSchema);
  return cached;
}
