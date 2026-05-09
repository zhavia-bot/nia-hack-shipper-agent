/**
 * IMMUTABLE — agent must never edit this file. Karpathy `prepare.py`
 * analog. CODEOWNERS gates changes.
 *
 * Read-only views into the ledger. The agent uses these to make
 * keep/discard decisions and to feed the next generation's prompts. No
 * write paths here — revenue is recognized exclusively by Convex
 * `ledger:recordCharge` from the stripe-webhook identity.
 */
import { convexClient } from "./tools/convex-client.js";

export async function metricsForExperiment(experimentId: string) {
  return convexClient().query("experiments:metrics", { id: experimentId });
}

export async function ledgerEventsForExperiment(experimentId: string) {
  return convexClient().query("ledger:byExperiment", { experimentId });
}

export async function netCumulative(): Promise<number> {
  const v = await convexClient().query("ledger:totalNet", {});
  return typeof v === "number" ? v : 0;
}

export interface MeasuredOutcome {
  experimentId: string;
  spendUsd: number;
  revenueUsd: number;
  visitors: number;
  conversions: number;
  asyncFailure: boolean;
  disputed: boolean;
}

export async function measure(experimentId: string): Promise<MeasuredOutcome> {
  const exp = await metricsForExperiment(experimentId);
  if (!exp) throw new Error(`experiment ${experimentId} not found`);
  return {
    experimentId,
    spendUsd: exp.spendUsd,
    revenueUsd: exp.revenueUsd,
    visitors: exp.visitors,
    conversions: exp.conversions,
    asyncFailure: !!exp.asyncFailure,
    disputed: !!exp.disputed,
  };
}
