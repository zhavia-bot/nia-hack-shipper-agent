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
 * P8.1 pivot: ChannelSchema is now `tiktok_shop` only. The driver
 * still reports the full daily budget as spend so downstream ROAS
 * math has a sensible denominator; the TikTok ad-create call itself
 * is intentionally stubbed for the hackathon — settlement happens
 * via the refund-all path (P8.10) regardless of whether real impressions
 * are bought.
 */
export async function driveTraffic(args: DriveTrafficArgs): Promise<void> {
  log.info("driving traffic", {
    channel: args.channel,
    tenantUrl: args.tenantUrl,
    budgetUsd: args.budgetUsd,
  });

  switch (args.channel) {
    case "tiktok_shop":
      await reportSpend({
        reservationId: args.reservationId,
        amountUsd: args.budgetUsd,
      });
      return;
  }
}
