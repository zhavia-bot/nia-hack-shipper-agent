"use workflow";

import { sleep } from "workflow";
import type { Hypothesis } from "@autoresearch/schemas";
import { BudgetError, createLogger } from "@autoresearch/shared";
import type { MeasuredOutcome } from "../revenue.js";
import {
  setupExperiment,
  scoutProductSource,
  persistScrapedImages,
  shipTenant,
  kickTraffic,
  measureAndFinalize,
  rollbackOnCrash,
} from "./steps/hypothesis-steps.js";

const log = createLogger("workflows.run-hypothesis");

const MEASUREMENT_WINDOW = "60m";

export interface ChildResult {
  experimentId: string;
  status: "pending" | "crash";
  error?: string;
  metrics?: MeasuredOutcome;
}

/**
 * One hypothesis = one workflow run. Steps are durable + idempotent;
 * `sleep('60m')` is a workflow primitive, not a setTimeout — the runtime
 * snapshots state and resumes the workflow after the timer fires, even if
 * the host process restarts.
 *
 * Each step re-hydrates the BYOK run-context from Convex (AsyncLocalStorage
 * doesn't cross step replay).
 */
export async function runHypothesis(h: Hypothesis): Promise<ChildResult> {
  let experimentId = "";
  let reservationId: string | null = null;
  try {
    const setup = await setupExperiment(h);
    experimentId = setup.experimentId;
    reservationId = setup.reservationId;

    // P8.6: scout a real Temu/Alibaba/1688 product matching the bucket.
    // P8.7: download the scouted images into Convex File Storage so the
    // storefront and image-gen step have permanent URLs to work with.
    // The LLM proposal never owns productSource — it's filled here.
    const scout = await scoutProductSource(h);
    const persisted = await persistScrapedImages(h, scout.productSource);
    const hWithSource: Hypothesis = { ...h, productSource: persisted.productSource };

    const ship = await shipTenant(hWithSource, experimentId);
    await kickTraffic(hWithSource, experimentId, reservationId, ship.subdomain);

    await sleep(MEASUREMENT_WINDOW);

    const metrics = await measureAndFinalize(hWithSource, experimentId, reservationId);
    return { experimentId, status: "pending", metrics };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("hypothesis crashed", {
      experimentId: experimentId || h.id,
      reservationId: reservationId ?? undefined,
      err: msg,
    });
    if (experimentId) {
      await rollbackOnCrash(experimentId, reservationId, err);
    }
    const code =
      err instanceof BudgetError ? `BudgetError(${err.code})` : "crash";
    return {
      experimentId: experimentId || h.id,
      status: "crash",
      error: `${code}: ${msg}`,
    };
  }
}
