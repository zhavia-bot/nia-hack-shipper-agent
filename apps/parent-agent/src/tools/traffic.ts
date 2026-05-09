import type { Channel, Copy } from "@autoresearch/schemas";
import { createLogger } from "@autoresearch/shared";
import { reportSpend } from "../budget.js";

const log = createLogger("parent-agent.traffic");

export interface DriveTrafficArgs {
  channel: Channel;
  tenantUrl: string;
  copy: Copy;
  reservationId: string;
  experimentId: string;
  budgetUsd: number;
}

/**
 * Channel-specific traffic drivers. v1 is a stub set: each channel logs
 * intent and reports the budget as ad_spend so downstream classification
 * has a sensible spend value during dev. Real Google/Meta/X integrations
 * are deliberately out of scope until the harness end-to-end is proven
 * green-path with a single owned-audience channel.
 */
export async function driveTraffic(args: DriveTrafficArgs): Promise<void> {
  log.info("driving traffic", {
    channel: args.channel,
    tenantUrl: args.tenantUrl,
    budgetUsd: args.budgetUsd,
  });

  switch (args.channel) {
    case "owned_audience":
      // No paid spend — assume the operator's owned channel handles it
      // out-of-band. Just log.
      return;

    case "cold_email":
      // Spend is the per-email + Resend overhead; modeled as flat for now.
      await reportSpend({ reservationId: args.reservationId, amountUsd: 1 });
      return;

    case "google_ads":
    case "meta_ads":
    case "x_organic":
    case "reddit":
    case "tiktok_organic":
      // Real implementations would post the ad / submission here.
      // Stub: assume the full daily budget is reported as spend.
      await reportSpend({
        reservationId: args.reservationId,
        amountUsd: args.budgetUsd,
      });
      return;
  }
}
