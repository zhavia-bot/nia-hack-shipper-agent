import type { Bucket } from "@autodrop/schemas";
import { betaSample } from "./beta.js";

export interface BucketStats {
  bucket: Bucket;
  alpha: number; // 1 + total conversions in bucket
  beta: number; // 1 + total non-conversions in bucket
}

/**
 * Mildly optimistic prior for buckets with no observations. Beta(2, 5) is
 * peaked around 0.22 — high enough that empty buckets get sampled
 * occasionally for exploration without dominating the queue.
 */
export const WEAK_PRIOR_ALPHA = 2;
export const WEAK_PRIOR_BETA = 5;

export function withWeakPrior(stats: BucketStats): BucketStats {
  if (stats.alpha + stats.beta < WEAK_PRIOR_ALPHA + WEAK_PRIOR_BETA) {
    return {
      bucket: stats.bucket,
      alpha: Math.max(stats.alpha, WEAK_PRIOR_ALPHA),
      beta: Math.max(stats.beta, WEAK_PRIOR_BETA),
    };
  }
  return stats;
}

/**
 * Thompson sampling at the bucket level: draw one cvr ~ Beta(α, β) per
 * bucket, then take the top `slots`. Buckets with wider posteriors (less
 * data) draw with more variance and occasionally win out — that's the
 * exploration source. Buckets with concentrated, high posteriors
 * (well-known winners) win consistently — that's the exploitation source.
 */
export function thompsonSampleBuckets(
  candidates: BucketStats[],
  slots: number
): Bucket[] {
  if (slots <= 0) return [];
  const sampled = candidates
    .map(withWeakPrior)
    .map((c) => ({ bucket: c.bucket, score: betaSample(c.alpha, c.beta) }));
  sampled.sort((a, b) => b.score - a.score);
  return sampled.slice(0, slots).map((s) => s.bucket);
}
