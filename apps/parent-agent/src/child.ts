import { fn } from "./tensorlake.js";
import type { Hypothesis } from "@autoresearch/schemas";
import { BudgetError, createLogger } from "@autoresearch/shared";
import { reserveBudget, finalizeBudget, releaseBudget } from "./budget.js";
import { measure, type MeasuredOutcome } from "./revenue.js";
import { stripe } from "./tools/stripe.js";
import { driveTraffic } from "./tools/traffic.js";
import { generateAndPersist } from "./tools/deliverables.js";
import { convexClient } from "./tools/convex-client.js";
import { loadRunKeys, withRunContext } from "./run-context.js";

const log = createLogger("parent-agent.child");

export interface ChildResult {
  experimentId: string;
  status: "pending" | "crash";
  error?: string;
  metrics?: MeasuredOutcome;
}

const MEASUREMENT_WINDOW_MS = 60 * 60 * 1000; // 60 min

/**
 * Tensorlake `@function` — one hypothesis per invocation. Each child:
 *   1. Creates an experiment row (no money spent yet).
 *   2. Reserves the budget atomically (BEFORE any external spend).
 *   3. Generates the deliverable artifact, uploads to Convex storage.
 *   4. Creates Stripe Product + Price (no Payment Link).
 *   5. Inserts a tenant row → goes live via the storefront's middleware.
 *   6. Drives traffic on the configured channel.
 *   7. Sleeps for the measurement window.
 *   8. Reads metrics, finalizes the reservation, returns.
 *
 * On exception: releases unspent reserved budget so the cap isn't
 * permanently held, and marks the experiment `crash` with the error.
 */
export const runChild = fn(
  { name: "run-hypothesis", timeout: "90m", memoryMb: 2048 },
  async (h: Hypothesis): Promise<ChildResult> => {
    const keys = await loadRunKeys(h.actingUserId);
    return withRunContext({ actingUserId: h.actingUserId, keys }, () =>
      runChildBody(h),
    );
  },
);

async function runChildBody(h: Hypothesis): Promise<ChildResult> {
  const expId = await convexClient().mutation<string>("experiments:create", {
    actingUserId: h.actingUserId,
    hypothesisId: h.id,
    generation: h.generation,
    parentId: h.parentId,
    bucket: h.bucket,
    rationale: h.rationale,
  });

  let reservationId: string | null = null;
  try {
    reservationId = await reserveBudget({
      experimentId: expId,
      generation: h.generation,
      amountUsd: h.trafficPlan.budgetUsd,
    });
    log.info("budget reserved", {
      experimentId: expId,
      reservationId,
      amountUsd: h.trafficPlan.budgetUsd,
    });

    const deliverable = await generateAndPersist({
      deliverable: h.deliverable,
      baseFilename: `tenant-${h.id.slice(0, 12)}`,
    });

    const { productId, priceId } = await stripe.createProductAndPrice({
      name: h.copy.headline,
      description: h.copy.subhead,
      unitAmountCents: h.price * 100,
      currency: "usd",
    });

    const subdomain = `exp-${h.id.slice(0, 8).toLowerCase()}`;
    await convexClient().mutation("tenants:create", {
      actingUserId: h.actingUserId,
      subdomain,
      hypothesisId: h.id,
      experimentId: expId,
      generation: h.generation,
      stripeProductId: productId,
      stripePriceId: priceId,
      deliverableKind: h.deliverable.kind,
      deliverableSpec: h.deliverable.spec,
      deliverableStorageId: deliverable.storageId,
    });

    await driveTraffic({
      channel: h.bucket.channel as any,
      tenantUrl: `https://${subdomain}.${process.env["APEX_DOMAIN"]}`,
      copy: h.copy,
      reservationId,
      experimentId: expId,
      budgetUsd: h.trafficPlan.budgetUsd,
    });

    await sleep(MEASUREMENT_WINDOW_MS);

    const metrics = await measure(expId);
    await finalizeBudget(reservationId);
    log.info("child finished", { experimentId: expId, ...metrics });

    return { experimentId: expId, status: "pending", metrics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("child crashed", {
      experimentId: expId,
      reservationId,
      err: msg,
    });

    if (reservationId) {
      await releaseBudget(reservationId).catch(() => undefined);
    }
    await convexClient()
      .mutation("experiments:markCrashed", { id: expId, error: msg })
      .catch(() => undefined);

    const code =
      err instanceof BudgetError ? `BudgetError(${err.code})` : "crash";
    return { experimentId: expId, status: "crash", error: `${code}: ${msg}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
