import { z } from "zod";

/**
 * Singleton. Mutable only by `admin` (humans, via migration) or
 * `budget-watchdog` (which can ONLY set killSwitchHalt = true). The `agent`
 * identity cannot mutate this table at all.
 */
export const BudgetStateSchema = z.object({
  perExperimentUsd: z.number().min(0),
  perGenerationUsd: z.number().min(0),
  perDayUsd: z.number().min(0),
  killSwitchHalt: z.boolean(),
  killSwitchReason: z.string().nullable().optional(),
});
export type BudgetState = z.infer<typeof BudgetStateSchema>;

export const BudgetReservationStatusSchema = z.enum([
  "active",
  "finalized",
  "released",
]);
export type BudgetReservationStatus = z.infer<
  typeof BudgetReservationStatusSchema
>;

/**
 * Atomic spend reservation. Children must reserve from the budget BEFORE any
 * external spend. Convex mutations are serializable, which closes the TOCTOU
 * window in cap enforcement.
 */
export const BudgetReservationSchema = z.object({
  experimentId: z.string(),
  generation: z.number().int().nonnegative(),
  reservedUsd: z.number().min(0),
  spentUsd: z.number().min(0),
  status: BudgetReservationStatusSchema,
  reservedAt: z.number().int(),
  finalizedAt: z.number().int().nullable().optional(),
});
export type BudgetReservation = z.infer<typeof BudgetReservationSchema>;

export const AssetSpendKindSchema = z.enum([
  "asset_gen",
  "ad_spend",
  "browserbase",
  "email_send",
  "domain_purchase",
  "llm_inference",
]);
export type AssetSpendKind = z.infer<typeof AssetSpendKindSchema>;
