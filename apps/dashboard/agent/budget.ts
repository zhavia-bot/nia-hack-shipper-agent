/**
 * IMMUTABLE — agent must never edit this file. Karpathy `prepare.py`
 * analog. CODEOWNERS gates changes.
 *
 * Thin wrappers over the IMMUTABLE Convex budget mutations
 * (`convex/budget.ts`). The atomic enforcement happens server-side; this
 * file's only job is to (1) be the single agent-side import path so
 * call sites are easy to audit, and (2) translate Convex errors into
 * typed BudgetError instances for the failure model in §8.
 */
import { BudgetError } from "@autodrop/shared";
import { convexClient } from "./tools/convex-client.js";

export interface ReserveArgs {
  experimentId: string;
  generation: number;
  amountUsd: number;
}

export async function reserveBudget(args: ReserveArgs): Promise<string> {
  try {
    return await convexClient().mutation("budget:reserve", args);
  } catch (err) {
    throw mapBudgetError(err);
  }
}

export async function reportSpend(args: {
  reservationId: string;
  amountUsd: number;
}): Promise<void> {
  try {
    await convexClient().mutation("budget:reportSpend", args);
  } catch (err) {
    throw mapBudgetError(err);
  }
}

export async function finalizeBudget(reservationId: string): Promise<void> {
  await convexClient().mutation("budget:finalize", { reservationId });
}

export async function releaseBudget(reservationId: string): Promise<void> {
  await convexClient().mutation("budget:release", { reservationId });
}

export async function killSwitchTripped(): Promise<{
  halt: boolean;
  reason: string | null;
}> {
  return convexClient().query("system:killSwitchState", {});
}

function mapBudgetError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("HALTED")) return new BudgetError("HALTED", msg);
  if (msg.includes("PER_EXP_CAP")) return new BudgetError("PER_EXP_CAP", msg);
  if (msg.includes("PER_GEN_CAP")) return new BudgetError("PER_GEN_CAP", msg);
  if (msg.includes("PER_DAY_CAP")) return new BudgetError("PER_DAY_CAP", msg);
  if (msg.includes("OVERSPEND")) return new BudgetError("OVERSPEND", msg);
  return err instanceof Error ? err : new Error(msg);
}
