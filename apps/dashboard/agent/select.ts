import { classifyROAS } from "@autodrop/bandit";
import { createLogger } from "@autodrop/shared";
import { measure } from "./revenue.js";
import { convexClient } from "./tools/convex-client.js";

const log = createLogger("parent-agent.select");

export interface ChildOutcome {
  experimentId: string;
  status: "pending" | "crash";
  error?: string;
}

/**
 * For each settled child, fetch the latest metrics from Convex and
 * apply the Bayesian classifier. Persists the decision back to the
 * experiments table. Crashed children are passed through unchanged
 * (their classification was already set when they crashed).
 */
export async function selectAndClassify(
  outcome: PromiseSettledResult<ChildOutcome>
): Promise<void> {
  if (outcome.status === "rejected") {
    log.error("child rejected outside its own try/catch — investigating", {
      reason: String(outcome.reason),
    });
    return;
  }

  const child = outcome.value;
  if (child.status === "crash") return;

  const m = await measure(child.experimentId);
  const decision = classifyROAS({
    spendUsd: m.spendUsd,
    revenueUsd: m.revenueUsd,
    visitors: m.visitors,
    conversions: m.conversions,
  });

  log.info("classified", {
    experimentId: child.experimentId,
    status: decision.status,
    roasMean: decision.roasMean,
    roasLower: decision.roasLower,
    roasUpper: decision.roasUpper,
  });

  await convexClient().mutation("experiments:updateClassification", {
    id: child.experimentId,
    status: decision.status,
    roasMean: decision.roasMean,
    roasLower: decision.roasLower,
    roasUpper: decision.roasUpper,
    notes: `roas=${decision.roasMean.toFixed(2)} CI=[${decision.roasLower.toFixed(2)},${decision.roasUpper.toFixed(2)}]`,
  });
}
