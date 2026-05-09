import { AsyncLocalStorage } from "node:async_hooks";
import { convexClient } from "./tools/convex-client.js";

/**
 * Per-run BYOK key bundle. Populated at the top of every workflow step from
 * the acting user's row, threaded into every external tool via
 * `AsyncLocalStorage`. Tools call `getKey('aiGateway')` (or one of the
 * named helpers) instead of reading the env directly, so the same code path
 * works for any user without a process restart.
 *
 * P7.2 — every key here is BYOK; no env fallbacks. Platform-level keys
 * (Stripe, Convex, Vercel, Apex) live in env.ts and are not part of this
 * bundle.
 *
 * Note: AsyncLocalStorage does NOT cross durable workflow step boundaries.
 * In Vercel Workflows each step re-hydrates its own context via
 * `withRunContext({...}, fn)` after calling `loadRunKeys(actingUserId)`.
 */
export interface RunKeys {
  aiGateway: string | null;
  resend: string | null;
  reacher: string | null;
  nia: string | null;
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
 * Load BYOK keys for a user from Convex. Called at the top of every
 * workflow step that needs to do tool work.
 */
export async function loadRunKeys(actingUserId: string): Promise<RunKeys> {
  const r = await convexClient().query<RunKeys>("users:keysForUser", {
    userId: actingUserId,
  });
  return r;
}

export type KeyName = keyof RunKeys;

/**
 * Per-run key reader. Returns the user's BYOK key when run context is
 * set, otherwise throws — every key here is BYOK, no env fallback.
 */
export function getKey(name: KeyName): string {
  const ctx = storage.getStore();
  const fromCtx = ctx?.keys[name];
  if (fromCtx) return fromCtx;
  throw new Error(
    `BYOK key missing: ${name}. ${
      ctx
        ? `User ${ctx.actingUserId} has not connected their ${name} key in /console/settings/keys.`
        : `No run context active — every step must call withRunContext({actingUserId, keys}) first.`
    }`,
  );
}

