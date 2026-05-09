import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { createLogger } from "@autoresearch/shared";
import { reportSpend } from "../budget.js";
import { getKey } from "../run-context.js";

const log = createLogger("parent-agent.images");

/**
 * Pinned snapshot per `docs/stack.md` §4.7. gpt-image-2 defaults drift;
 * we pin the date to keep behavior reproducible across re-runs.
 */
export const GPT_IMAGE_MODEL = "gpt-image-2-2026-04-21";
export const FLUX_FAL_PATH = "fal-ai/flux-pro/v2";

// Per-run clients — keyed by the BYOK key so concurrent runs for
// different users don't share a singleton.
const openaiClients = new Map<string, OpenAI>();
function openai(): OpenAI {
  const key = getKey("openai");
  let client = openaiClients.get(key);
  if (!client) {
    client = new OpenAI({ apiKey: key });
    openaiClients.set(key, client);
  }
  return client;
}

let lastFalKey: string | null = null;
function ensureFal(): void {
  const key = getKey("fal");
  if (lastFalKey === key) return;
  fal.config({ credentials: key });
  lastFalKey = key;
}

export type ImagePurpose = "hero" | "cover" | "ad_background";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "2048x2048";

export interface GenerateImageArgs {
  reservationId: string;
  prompt: string;
  size?: ImageSize;
  purpose: ImagePurpose;
}

export interface GeneratedImage {
  url: string;
  provider: "openai_gpt_image_2" | "fal_flux2_pro";
  costUsd: number;
}

/**
 * Try gpt-image-2 first; on a content-policy or rate-limit error fall
 * back to FLUX 2 Pro via fal. Budget cost is reported into the
 * experiment's reservation BEFORE returning the URL — this is the asset
 * cost guard from `docs/stack.md` §4.7.
 *
 * The returned URL is the provider's expiring URL. The CALLER must
 * download and persist it to Convex File Storage (see `tools/storage.ts`)
 * before any tenant row references it.
 */
export async function generateImage(
  args: GenerateImageArgs
): Promise<GeneratedImage> {
  const size = args.size ?? "1024x1024";
  try {
    const r = await openai().images.generate({
      model: GPT_IMAGE_MODEL,
      prompt: args.prompt,
      n: 1,
      size,
    });
    const url = r.data?.[0]?.url;
    if (!url) throw new Error("openai images.generate returned no URL");

    const cost = estimateGptImageCost(size);
    await reportSpend({ reservationId: args.reservationId, amountUsd: cost });
    log.info("image generated via gpt-image-2", {
      reservationId: args.reservationId,
      purpose: args.purpose,
      size,
      cost,
    });
    return { url, provider: "openai_gpt_image_2", costUsd: cost };
  } catch (err) {
    if (!isPolicyOrRateLimitError(err)) throw err;
    log.warn("gpt-image-2 unavailable, falling back to FLUX 2 Pro", {
      reservationId: args.reservationId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return generateViaFlux(args, size);
  }
}

async function generateViaFlux(
  args: GenerateImageArgs,
  size: ImageSize
): Promise<GeneratedImage> {
  ensureFal();
  const result = await fal.run(FLUX_FAL_PATH, {
    input: { prompt: args.prompt, image_size: mapSizeForFlux(size) },
  });
  const url = (result as any)?.data?.images?.[0]?.url;
  if (!url) throw new Error("fal flux2 returned no image URL");
  const cost = 0.055;
  await reportSpend({ reservationId: args.reservationId, amountUsd: cost });
  return { url, provider: "fal_flux2_pro", costUsd: cost };
}

function isPolicyOrRateLimitError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return (
      err.status === 400 ||
      err.status === 429 ||
      err.code === "content_policy_violation"
    );
  }
  return false;
}

function estimateGptImageCost(size: ImageSize): number {
  // Approximate per-image USD cost per `docs/stack.md` §4.7.
  switch (size) {
    case "1024x1024":
      return 0.04;
    case "1024x1536":
    case "1536x1024":
      return 0.1;
    case "2048x2048":
      return 0.35;
  }
}

function mapSizeForFlux(size: ImageSize): string {
  switch (size) {
    case "1024x1024":
      return "square_hd";
    case "1024x1536":
      return "portrait_4_3";
    case "1536x1024":
      return "landscape_4_3";
    case "2048x2048":
      return "square_hd";
  }
}
