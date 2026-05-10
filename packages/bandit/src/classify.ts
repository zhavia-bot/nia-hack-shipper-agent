import type { ExperimentStatus } from "@autodrop/schemas";
import { betaQuantile } from "./beta.js";

export interface ClassifyInput {
  spendUsd: number;
  revenueUsd: number;
  visitors: number;
  conversions: number;
}

export interface ClassifyOutput {
  status: ExperimentStatus;
  roasMean: number;
  roasLower: number;
  roasUpper: number;
}

export const MIN_VISITORS_FOR_DECISION = 30;
export const KEEP_LOWER_THRESHOLD = 1.0;
export const DISCARD_UPPER_THRESHOLD = 0.5;
export const REFINE_BAND_LOW = 0.5;
export const REFINE_BAND_HIGH = 1.0;

/**
 * Classify an experiment by ROAS using a Beta-Bernoulli posterior over
 * conversion rate. ROAS_lower > 1.0 → keep, ROAS_upper < 0.5 → discard,
 * mean ∈ [0.5, 1.0] → refine. Otherwise pending.
 *
 * Mirrors the spec in `docs/stack.md` §6.3 verbatim, including the
 * empirical-AOV-when-zero-conversions choice (which yields ROAS = 0 for
 * dry experiments; see open Q §12 #9 in stack.md for the cold-start floor).
 */
export function classifyROAS(input: ClassifyInput): ClassifyOutput {
  const { spendUsd, revenueUsd, visitors, conversions } = input;

  if (visitors < MIN_VISITORS_FOR_DECISION || spendUsd <= 0) {
    return { status: "pending", roasMean: 0, roasLower: 0, roasUpper: 0 };
  }

  // Beta(1, 1) prior + observations. α counts successes, β counts failures.
  const alpha = 1 + conversions;
  const beta = 1 + (visitors - conversions);
  const cvrLower = betaQuantile(alpha, beta, 0.05);
  const cvrUpper = betaQuantile(alpha, beta, 0.95);
  const cvrMean = alpha / (alpha + beta);

  // Empirical AOV; matches design in stack.md §6.3.
  const aov = conversions > 0 ? revenueUsd / conversions : 0;

  const roasLower = (visitors * cvrLower * aov) / spendUsd;
  const roasUpper = (visitors * cvrUpper * aov) / spendUsd;
  const roasMean = (visitors * cvrMean * aov) / spendUsd;

  let status: ExperimentStatus = "pending";
  if (roasLower > KEEP_LOWER_THRESHOLD) status = "keep";
  else if (roasUpper < DISCARD_UPPER_THRESHOLD) status = "discard";
  else if (roasMean >= REFINE_BAND_LOW && roasMean <= REFINE_BAND_HIGH)
    status = "refine";

  return { status, roasMean, roasLower, roasUpper };
}
