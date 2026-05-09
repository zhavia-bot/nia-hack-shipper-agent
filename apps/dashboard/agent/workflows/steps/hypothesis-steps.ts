"use step";

import { z } from "zod";
import {
  ProductSourceSchema,
  type Hypothesis,
  type ProductSource,
} from "@autoresearch/schemas";
import { createLogger } from "@autoresearch/shared";
import { reserveBudget, finalizeBudget, releaseBudget } from "../../budget.js";
import { measure, type MeasuredOutcome } from "../../revenue.js";
import { stripe } from "../../tools/stripe.js";
import { driveTraffic } from "../../tools/traffic.js";
import { convexClient } from "../../tools/convex-client.js";
import { agentBrowser } from "../../tools/agent-browser.js";
import { generateJson, MODEL_SONNET } from "../../tools/llm.js";
import { persistImageToConvex } from "../../tools/storage.js";
import { generateImage, type ImagePurpose } from "../../tools/images.js";
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

/**
 * Scout a real product from a Chinese marketplace (Temu first, with
 * Alibaba / 1688 as fallbacks) that matches the hypothesis bucket + copy.
 * Uses agent-browser inside @vercel/sandbox to fetch the search-results
 * page, then has Sonnet pick the best match from the accessibility tree
 * and emit a strict ProductSource shape.
 *
 * `scrapedImageStorageIds` is left empty here — P8.7 downloads the
 * picked product's photos and writes them to Convex File Storage. The
 * shape is filled in run-hypothesis.ts before shipTenant runs.
 *
 * On any failure (sandbox down, parsing fails schema), the step throws;
 * runHypothesis catches and routes the experiment through rollbackOnCrash.
 */
export async function scoutProductSource(
  h: Hypothesis,
): Promise<{ productSource: ProductSource }> {
  return withUserCtx(h.actingUserId, async () => {
    const query = `${h.bucket.niche} ${h.bucket.category} ${h.copy.headline}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const searchUrl = `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(query)}`;

    log.info("scouting product", { query, searchUrl });
    const browse = await agentBrowser.run(
      [
        { cmd: "browse", args: [searchUrl, "--json"] },
      ],
      { timeoutMs: 90_000 },
    );
    const stdout = browse.results[0]?.stdout ?? "";
    if (!stdout) {
      throw new Error("agent-browser returned empty stdout for Temu search");
    }

    const PickSchema = z.object({
      marketplace: z.literal("temu"),
      url: z.string().url(),
      originalTitle: z.string().min(1).max(300),
      originalPriceUsd: z.number().min(0).max(1000),
      candidateImageUrls: z.array(z.string().url()).min(1).max(10),
    });
    const picked = await generateJson({
      model: MODEL_SONNET,
      prompt: {
        name: "scout-product-source",
        version: "v1.0.0",
        system:
          "You parse one Temu search-results accessibility tree and pick the SINGLE best product match. Output strict JSON only — no prose, no markdown. Pick the most relevant card to the query, with a sane sub-$30 price and at least one product photo URL.",
        user: `Hypothesis bucket: ${h.bucket.niche} / ${h.bucket.category} / ${h.bucket.priceTier} / ${h.bucket.channel}\nHeadline: ${h.copy.headline}\nTarget price: ~$${h.price}\n\nAccessibility tree from ${searchUrl}:\n${stdout.slice(0, 60_000)}\n\nReturn JSON: { marketplace: "temu", url, originalTitle, originalPriceUsd, candidateImageUrls: [...] }. The url and image urls must be absolute. Keep candidateImageUrls between 1 and 10.`,
      },
      schema: PickSchema,
      maxTokens: 1024,
    });

    const productSource: ProductSource = ProductSourceSchema.parse({
      marketplace: picked.marketplace,
      url: picked.url,
      originalTitle: picked.originalTitle,
      originalPriceUsd: picked.originalPriceUsd,
      // P8.7 downloads from candidateImageUrls and replaces this with
      // Convex storage IDs. We stash the URLs as-is here so they're
      // accessible to the next step — schema allows arbitrary strings.
      scrapedImageStorageIds: picked.candidateImageUrls,
    });

    log.info("scouted", {
      url: productSource.url,
      title: productSource.originalTitle.slice(0, 80),
      priceUsd: productSource.originalPriceUsd,
      imgCandidates: picked.candidateImageUrls.length,
    });
    return { productSource };
  });
}

/**
 * Download the scout's raw image URLs and stash them in Convex File
 * Storage so the storefront and the image-gen step (P8.8) can rely on
 * permanent URLs instead of provider-side ones that decay.
 *
 * Per-image failures are skipped, not fatal: the scout often returns
 * thumbnails alongside primary photos, and a few may 404 by the time
 * we fetch. We require at least one image to land — if all fail we
 * throw, since downstream image-gen has nothing to re-skin.
 *
 * Best-effort detection of content-type via the response header, with
 * a `image/jpeg` fallback (matches what Temu actually serves).
 */
export async function persistScrapedImages(
  h: Hypothesis,
  productSource: ProductSource,
): Promise<{ productSource: ProductSource }> {
  return withUserCtx(h.actingUserId, async () => {
    const candidateUrls = productSource.scrapedImageStorageIds.slice(0, 5);
    const settled = await Promise.allSettled(
      candidateUrls.map(async (sourceUrl) => {
        const head = await fetch(sourceUrl, { method: "HEAD" }).catch(() => null);
        const contentType =
          head?.headers.get("content-type") ?? "image/jpeg";
        const { storageId } = await persistImageToConvex({
          sourceUrl,
          contentType,
        });
        return storageId;
      }),
    );
    const storageIds = settled
      .filter((s): s is PromiseFulfilledResult<string> => s.status === "fulfilled")
      .map((s) => s.value);
    const failed = settled.length - storageIds.length;
    if (storageIds.length === 0) {
      throw new Error(
        `persistScrapedImages: all ${candidateUrls.length} downloads failed`,
      );
    }
    log.info("scraped images persisted", {
      kept: storageIds.length,
      failed,
      total: candidateUrls.length,
    });
    return {
      productSource: { ...productSource, scrapedImageStorageIds: storageIds },
    };
  });
}

/**
 * Generate three ad creatives for this hypothesis via AI Gateway
 * (FLUX 2 primary, Gemini 3 Pro Image fallback) and persist each to
 * Convex File Storage. Returns the resulting storage IDs, ready to
 * fold into hypothesis.adCreativeStorageIds before shipTenant runs.
 *
 * Image-gen happens text-to-image — FLUX 2 doesn't take a reference
 * image through the ai SDK's experimental_generateImage surface, so we
 * lean on the scouted product's title + the hypothesis copy to build
 * the prompts. The three shots (hero, lifestyle, cover) cover the
 * usual TikTok-Shop placements: PDP hero, in-context lifestyle, and
 * square ad thumbnail.
 *
 * Each generation reports its USD cost into the budget reservation
 * before returning — this is real spend, even at FLUX Flex prices,
 * and must be visible to the watchdog.
 */
export async function generateAdCreatives(
  h: Hypothesis,
  productSource: ProductSource,
  reservationId: string,
): Promise<{ adCreativeStorageIds: string[] }> {
  return withUserCtx(h.actingUserId, async () => {
    const baseSubject = `${productSource.originalTitle}, a ${h.bucket.niche} product`;
    const shots: {
      purpose: ImagePurpose;
      prompt: string;
      size: "1024x1024" | "1024x1536" | "1536x1024" | "2048x2048";
    }[] = [
      {
        purpose: "hero",
        size: "1024x1536",
        prompt: `Clean studio product photo: ${baseSubject}. White seamless background, soft directional lighting from upper-left, faint reflection on glossy surface, no text, no watermarks, no human hands. The product is centered and crisp. Tone: premium TikTok Shop listing.`,
      },
      {
        purpose: "ad_background",
        size: "1536x1024",
        prompt: `Lifestyle product photo: ${baseSubject}, used naturally in a bright modern home setting that fits the niche '${h.bucket.niche}'. Soft natural window light, shallow depth of field, no text, no logos. Composition leaves negative space on the right for ad copy.`,
      },
      {
        purpose: "cover",
        size: "1024x1024",
        prompt: `Square ad thumbnail: ${baseSubject}. Eye-catching, high-contrast, color palette pulled from the product itself. No text or human faces. Suitable for a TikTok Shop ad placement at small sizes — keep silhouette legible.`,
      },
    ];

    const settled = await Promise.allSettled(
      shots.map(async (s) => {
        const img = await generateImage({
          reservationId,
          prompt: s.prompt,
          size: s.size,
          purpose: s.purpose,
        });
        // generateImage returns a data URL; persistImageToConvex fetches
        // it and PUTs the bytes — fetch() understands data URLs natively.
        const { storageId } = await persistImageToConvex({
          sourceUrl: img.url,
          contentType: "image/png",
        });
        return storageId;
      }),
    );
    const ids = settled
      .filter((s): s is PromiseFulfilledResult<string> => s.status === "fulfilled")
      .map((s) => s.value);
    const failed = settled.length - ids.length;
    if (ids.length === 0) {
      throw new Error("generateAdCreatives: every shot failed");
    }
    log.info("ad creatives generated", { kept: ids.length, failed });
    return { adCreativeStorageIds: ids };
  });
}

/**
 * Ship the tenant storefront. P8.1 schema pivot: callers must pass the
 * scouted `productSource` (P8.6) and the AI-generated `adCreativeStorageIds`
 * (P8.8). This step itself just creates the Stripe product + Convex tenant
 * row — no deliverable generation any more, since the product is a real
 * physical SKU (no PDF/ZIP to render).
 */
export async function shipTenant(
  h: Hypothesis,
  experimentId: string,
): Promise<{ subdomain: string }> {
  return withUserCtx(h.actingUserId, async () => {
    if (!h.productSource) {
      throw new Error(
        "shipTenant called before scoutProductSource — h.productSource is null",
      );
    }
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
      productSource: h.productSource,
      adCreativeStorageIds: h.adCreativeStorageIds,
    });
    log.info("tenant live", { experimentId, subdomain });
    return { subdomain };
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
    log.info("measured + finalized", { ...metrics });
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
