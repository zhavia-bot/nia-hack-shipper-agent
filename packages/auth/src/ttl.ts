import type { IdentityRole } from "@autodrop/schemas";

/**
 * Per-identity default TTLs. Tighter for agent (it can re-mint at boot
 * and runs for hours not days). Looser for admin (humans, manual ops).
 *
 * | role           | default TTL |
 * |----------------|-------------|
 * | agent          | 1 hour      |
 * | stripe-webhook | 24 hours    |
 * | refund-worker  | 24 hours    |
 * | dashboard      | 7 days      |
 * | admin          | 30 days     |
 */
export const TTL_SECONDS_BY_ROLE: Record<IdentityRole, number> = {
  agent: 60 * 60,
  "stripe-webhook": 24 * 60 * 60,
  "refund-worker": 24 * 60 * 60,
  dashboard: 7 * 24 * 60 * 60,
  admin: 30 * 24 * 60 * 60,
  "budget-watchdog": 24 * 60 * 60,
};

export function defaultTtl(role: IdentityRole): number {
  return TTL_SECONDS_BY_ROLE[role];
}
