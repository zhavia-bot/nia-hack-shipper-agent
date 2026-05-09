"use step";

import type { Hypothesis } from "@autoresearch/schemas";
import { createLogger } from "@autoresearch/shared";
import { reserveBudget, finalizeBudget, releaseBudget } from "../../budget.js";
import { measure, type MeasuredOutcome } from "../../revenue.js";
import { stripe } from "../../tools/stripe.js";
import { driveTraffic } from "../../tools/traffic.js";
import { generateAndPersist } from "../../tools/deliverables.js";
import { convexClient } from "../../tools/convex-client.js";
import {
  loadRunKeys,
  withRunContext,
  type RunKeys,
} from "../../run-context.js";

const log = createLogger("workflows.steps.hypothesis");

/**
 * Each export below is a 'use step' — Vercel's runtime treats them as
 * idempotent units, caches their result by step ID, and replays cached
 * results when the workflow resumes after `sleep`. AsyncLocalStorage
 * doesn't survive replay, so every step that needs BYOK keys takes
 * `actingUserId` as an arg and re-hydrates `withRunContext` itself.
 */

async function withUserCtx<T>(
  actingUserId: string,
  fn: (keys: RunKeys) => Promise<T>,
): Promise<T> {
  const keys = await loadRunKeys(actingUserId);
  return withRunContext({ actingUserId, keys }, () => fn(keys));
}

export async function setupExperiment(h: Hypothesis): Promise<{
  experimentId: string;
  reservationId: string;
}> {
  return withUserCtx(h.actingUserId, async () => {
    const experimentId = await convexClient().mutation<string>(
      "experiments:create",
      {
        actingUserId: h.actingUserId,
        hypothesisId: h.id,
        generation: h.generation,
        parentId: h.parentId,
        bucket: h.bucket,
        rationale: h.rationale,
      },
    );
    const reservationId = await reserveBudget({
      experimentId,
      generation: h.generation,
      amountUsd: h.trafficPlan.budgetUsd,
    });
    log.info("setup complete", {
      experimentId,
      reservationId,
      amountUsd: h.trafficPlan.budgetUsd,
    });
    return { experimentId, reservationId };
  });
}

export async function shipTenant(
  h: Hypothesis,
  experimentId: string,
): Promise<{ subdomain: string; deliverableStorageId: string }> {
  return withUserCtx(h.actingUserId, async () => {
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
      experimentId,
      generation: h.generation,
      stripeProductId: productId,
      stripePriceId: priceId,
      deliverableKind: h.deliverable.kind,
      deliverableSpec: h.deliverable.spec,
      deliverableStorageId: deliverable.storageId,
    });
    log.info("tenant live", { experimentId, subdomain });
    return { subdomain, deliverableStorageId: deliverable.storageId };
  });
}

export async function kickTraffic(
  h: Hypothesis,
  experimentId: string,
  reservationId: string,
  subdomain: string,
): Promise<void> {
  return withUserCtx(h.actingUserId, async () => {
    await driveTraffic({
      channel: h.bucket.channel as never,
      tenantUrl: `https://${subdomain}.${process.env["APEX_DOMAIN"]}`,
      copy: h.copy,
      reservationId,
      experimentId,
      budgetUsd: h.trafficPlan.budgetUsd,
    });
  });
}

export async function measureAndFinalize(
  h: Hypothesis,
  experimentId: string,
  reservationId: string,
): Promise<MeasuredOutcome> {
  return withUserCtx(h.actingUserId, async () => {
    const metrics = await measure(experimentId);
    await finalizeBudget(reservationId);
    log.info("measured + finalized", { experimentId, ...metrics });
    return metrics;
  });
}

export async function rollbackOnCrash(
  experimentId: string,
  reservationId: string | null,
  err: unknown,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  if (reservationId) {
    await releaseBudget(reservationId).catch(() => undefined);
  }
  await convexClient()
    .mutation("experiments:markCrashed", { id: experimentId, error: msg })
    .catch(() => undefined);
}
