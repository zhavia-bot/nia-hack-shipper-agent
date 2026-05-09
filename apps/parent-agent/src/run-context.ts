import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "./env.js";
import { convexClient } from "./tools/convex-client.js";

/**
 * Per-run BYOK key bundle. Populated at the top of `runChild` from the
 * acting user's row, threaded into every external tool via
 * `AsyncLocalStorage`. Tools call `getKey('openai')` (or one of the
 * named helpers) instead of reading `env().OPENAI_API_KEY` directly,
 * so the same code path works for any user without a process restart.
 *
 * Keys outside this bundle (Stripe restricted, Vercel, Cloudflare zone
 * id, Anthropic, Exa) remain platform-level — they're not BYOK.
 *
 * Fallback: when no run-context is set (CLI experiments, ops scripts),
 * `getKey` falls back to the env var of the same name. Production
 * agent runs MUST always set context; the fallback exists so existing
 * dev tooling doesn't break.
 */
export interface RunKeys {
  openai: string | null;
  browserbase: string | null;
  resend: string | null;
  reacher: string | null;
  nia: string | null;
  fal: string | null;
  cloudflare: string | null;
}

export interface RunContext {
  actingUserId: string;
  keys: RunKeys;
}

const storage = new AsyncLocalStorage<RunContext>();

export function currentContext(): RunContext | undefined {
  return storage.getStore();
}

export async function withRunContext<T>(
  ctx: RunContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

/**
 * Load BYOK keys for a user from Convex. Called once at run start.
 * Throws if the user row is missing entirely; missing individual keys
 * are returned as null and surface as `getKey` errors only when a tool
 * actually tries to use them.
 */
export async function loadRunKeys(actingUserId: string): Promise<RunKeys> {
  const r = await convexClient().query<RunKeys>("users:keysForUser", {
    userId: actingUserId,
  });
  return r;
}

const ENV_FALLBACK: Record<KeyName, keyof ReturnType<typeof env>> = {
  openai: "OPENAI_API_KEY",
  browserbase: "BROWSERBASE_API_KEY",
  resend: "RESEND_API_KEY",
  reacher: "REACHER_API_KEY",
  nia: "NIA_API_KEY",
  fal: "FAL_API_KEY",
  cloudflare: "CLOUDFLARE_DNS_TOKEN",
};

export type KeyName = keyof RunKeys;

/**
 * Per-run key reader. Returns the user's BYOK key when run context is
 * set, otherwise falls back to the platform env var. Throws when
 * neither is available — the caller is asking for a key the user
 * never connected.
 */
export function getKey(name: KeyName): string {
  const ctx = storage.getStore();
  const fromCtx = ctx?.keys[name];
  if (fromCtx) return fromCtx;
  const envKey = ENV_FALLBACK[name];
  const fromEnv = env()[envKey];
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  throw new Error(
    `BYOK key missing: ${name}. ${
      ctx
        ? `User ${ctx.actingUserId} has not connected their ${name} key in /console/settings/keys.`
        : `No run context active and no ${envKey} fallback in env.`
    }`,
  );
}

/**
 * Cloudflare-specific: the parent-agent has historically used two
 * tokens (DNS + Registrar). Users only set one BYOK Cloudflare key.
 * For the user path we treat both as the same key; platform env keeps
 * the split for ops use.
 */
export function getCloudflareToken(
  scope: "dns" | "registrar",
): string {
  const ctx = storage.getStore();
  if (ctx?.keys.cloudflare) return ctx.keys.cloudflare;
  const e = env();
  return scope === "dns"
    ? e.CLOUDFLARE_DNS_TOKEN
    : e.CLOUDFLARE_REGISTRAR_TOKEN;
}
