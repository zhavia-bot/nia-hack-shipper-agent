import { z } from "zod";

export const LedgerEventTypeSchema = z.enum(["charge", "refund", "ad_spend"]);
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

export const LedgerEventSourceSchema = z.enum([
  "stripe_webhook",
  "google_ads_api",
  "meta_ads_api",
  "manual",
]);
export type LedgerEventSource = z.infer<typeof LedgerEventSourceSchema>;

/**
 * Append-only. Insert preconditions enforced inside the Convex mutation:
 *  - caller identity must be `stripe-webhook` (charges/refunds) or `agent` (ad_spend)
 *  - paymentStatus === "paid" for `charge` rows
 *  - stripeEventId not already present (idempotent)
 */
export const LedgerEventSchema = z.object({
  type: LedgerEventTypeSchema,
  amountUsd: z.number(),
  tenantId: z.string().nullable().optional(),
  experimentId: z.string().nullable().optional(),
  stripeEventId: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  source: LedgerEventSourceSchema,
  timestamp: z.number().int(),
});
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export const AuditLogKindSchema = z.enum([
  "session_completed_unpaid",
  "stripe_call",
  "vercel_call",
  "browserbase_session",
  "kill_switch_change",
]);
export type AuditLogKind = z.infer<typeof AuditLogKindSchema>;

export const AuditLogSchema = z.object({
  kind: AuditLogKindSchema,
  stripeEventId: z.string().nullable().optional(),
  experimentId: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  payload: z.unknown().optional(),
  timestamp: z.number().int(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
